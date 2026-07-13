import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../users/user.model';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';

const generateToken = (id: string) => {
  return jwt.sign({ id }, process.env.JWT_SECRET as string, {
    expiresIn: '30d',
  });
};

export const registerUser = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password, role, department, companyName } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    if (role === 'SUPER_ADMIN' || role === 'SUB_ADMIN') {
      return res.status(403).json({ message: 'Cannot register admin roles publicly' });
    }

    let isApproved = true;
    if (role === 'AGENT') {
      isApproved = false;
    }

    const user = await User.create({
      name,
      email,
      phone,
      password,
      role: role || 'USER',
      department: role === 'SUB_ADMIN' ? department : null,
      companyName: role === 'AGENT' ? companyName : null,
      isApproved
    });

    if (user) {
      res.status(201).json({
        _id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        isApproved: user.isApproved,
        token: generateToken(user.id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      if (user.role === 'AGENT' && !user.isApproved) {
        return res.status(401).json({ message: 'Agent account pending approval' });
      }

      res.json({
        _id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        token: generateToken(user.id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const googleAuth = async (req: Request, res: Response) => {
  try {
    const { token, role } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Firebase token is required' });
    }

    if (!getApps().length) {
       return res.status(500).json({ message: 'Firebase Admin not initialized on the server.' });
    }

    // Verify the Firebase ID token
    const decodedToken = await getAuth().verifyIdToken(token);
    const { email, name, picture } = decodedToken;

    if (!email) {
      return res.status(400).json({ message: 'No email found in Google account' });
    }

    // Check if user already exists
    let user = await User.findOne({ email });

    if (user) {
      if (role === 'AGENT' && user.role !== 'AGENT') {
        return res.status(400).json({ message: 'This Google account is already registered as a standard User. Please use a different email to register as an Agent.' });
      }
    } else {
      // Create a new user if they don't exist
      let isApproved = true;
      if (role === 'AGENT') {
        isApproved = false;
      }

      user = await User.create({
        name: name || 'User',
        email,
        role: role || 'USER',
        avatar: picture || '',
        isEmailVerified: true,
        isApproved
      });
    }

    // Generate JWT
    res.status(200).json({
      _id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      isApproved: user.isApproved,
      avatar: user.avatar,
      token: generateToken(user.id),
    });

  } catch (error: any) {
    console.error('Google Auth Error:', error);
    res.status(500).json({ message: 'Authentication failed. Please try again.' });
  }
};

import crypto from 'crypto';

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    // Set token expire to 10 minutes
    const resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000);

    user.resetPasswordToken = resetPasswordToken;
    user.resetPasswordExpire = resetPasswordExpire;
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${resetToken}`;

    // For local dev, we return the token/url directly since we don't have email setup
    res.status(200).json({ 
      success: true, 
      message: 'Password reset link generated',
      data: resetUrl
    });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const resetPasswordToken = crypto.createHash('sha256').update(req.params.resettoken as string).digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(200).json({ success: true, message: 'Password reset successful' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
