import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../users/user.model';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';
import { sendOTP } from '../../utils/email.service';

const generateToken = (id: string) => {
  return jwt.sign({ id }, process.env.JWT_SECRET as string, {
    expiresIn: '30d',
  });
};

export const registerUser = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password, role, department, companyName } = req.body;

    let user = await User.findOne({ email });
    
    if (user) {
      if (user.isEmailVerified) {
        return res.status(400).json({ message: 'User already exists and is verified. Please login.' });
      }
      // If user exists but is not verified, we'll update their details and resend OTP
      user.name = name;
      user.phone = phone;
      user.password = password; // Will be hashed in pre-save hook
      user.roles = [role || 'USER'];
      user.department = role === 'SUB_ADMIN' ? department : null;
      user.companyName = role === 'B2B_AGENT' ? companyName : null;
      user.agentStatus = role === 'B2B_AGENT' ? 'PENDING' : undefined;
    } else {
      let agentStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'INCOMPLETE' | undefined = undefined;
      if (role === 'B2B_AGENT') {
        agentStatus = 'PENDING';
      }

      user = await User.create({
        name,
        email,
        phone,
        password,
        roles: [role || 'USER'],
        department: role === 'SUB_ADMIN' ? department : null,
        companyName: role === 'B2B_AGENT' ? companyName : null,
        agentStatus
      });
    }

    if (user) {
      // Auto-dispatch OTP email synchronously before sending response
      const config = await User.findOne({ role: 'SUPER_ADMIN' }).lean();
      const expiryMinutes = config?.otpTime || 10;
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      user.otp = otpCode;
      user.otpExpiry = new Date(Date.now() + expiryMinutes * 60 * 1000);
      await user.save();
      
      console.log(`\n======================================================`);
      console.log(`🔑 [TESTING] GENERATED OTP FOR ${user.email} : ${otpCode}`);
      console.log(`======================================================\n`);
      
      try {
        await sendOTP(user.email, otpCode, expiryMinutes);
      } catch (emailError: any) {
        // If it's a new user and email fails, delete them so they aren't stuck
        if (user.isNew || !user.isEmailVerified) {
           await User.deleteOne({ _id: user._id });
        }
        return res.status(500).json({ message: 'Failed to send OTP email. Please try again later or check your email settings.' });
      }

      res.status(201).json({
        _id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles,
        department: user.department,
        agentStatus: user.agentStatus,
        isEmailVerified: user.isEmailVerified,
        message: 'OTP sent to your email. Please verify to complete registration.'
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const registerAgent = async (req: Request, res: Response) => {
  try {
    const {
      companyName,
      firstName,
      lastName,
      phone,
      email,
      password,
      officeAddress,
      state,
      city,
      pincode,
      panNumber,
      panCardImage,
      idProofType,
      idProofImage,
      gstn,
      gstImage,
      remarks,
    } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'An account with this email already exists' });
    }

    const name = `${firstName || ''} ${lastName || ''}`.trim() || companyName || 'Agent';

    const user = await User.create({
      name,
      firstName,
      lastName,
      email,
      phone,
      password: password || 'Agent@123',
      roles: ['SUPPLIER_AGENT'],
      companyName,
      officeAddress,
      state,
      city,
      pincode,
      panNumber,
      panCardImage,
      idProofType,
      idProofImage,
      gstn,
      gstImage,
      remarks,
      agentStatus: 'PENDING_APPROVAL',
      isApproved: false,
    });

    res.status(201).json({
      message: 'Agent registration submitted successfully. Please wait for Admin approval.',
      agentId: user._id,
      agentStatus: user.agentStatus,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      if (!user.isActive) {
        return res.status(401).json({ message: 'Account has been deactivated', status: 'INACTIVE' });
      }

      if (user.roles.includes('USER') && !user.isEmailVerified) {
        return res.status(401).json({ 
          message: 'Please verify your email first. Use the OTP sent to your email.', 
          status: 'UNVERIFIED', 
          userId: user.id 
        });
      }

      if ((user.roles.includes('B2B_AGENT') || user.roles.includes('SUPPLIER_AGENT')) && user.agentStatus !== 'APPROVED') {
        return res.status(401).json({ 
          message: 'Your registration is pending approval from Admin.', 
          status: user.agentStatus || 'PENDING_APPROVAL' 
        });
      }

      res.json({
        _id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles,
        department: user.department,
        companyName: user.companyName,
        supplierOwnerId: user.supplierOwnerId,
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
      if (role && !user.roles.includes(role)) {
        user.roles.push(role);
        if (role === 'B2B_AGENT' && !user.agentStatus) {
          user.agentStatus = 'PENDING';
        }
        await user.save();
      }
    } else {
      // Create a new user if they don't exist
      let agentStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'INCOMPLETE' | undefined = undefined;
      if (role === 'B2B_AGENT') {
        agentStatus = 'PENDING';
      }

      user = await User.create({
        name: name || 'User',
        email,
        roles: [role || 'USER'],
        avatar: picture || '',
        isEmailVerified: true,
        agentStatus
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account has been deactivated', status: 'INACTIVE' });
    }

    if (user.roles.includes('B2B_AGENT') && user.agentStatus !== 'APPROVED') {
      return res.status(401).json({ message: 'Agent account pending approval', status: 'PENDING' });
    }

    // Generate JWT
    res.status(200).json({
      _id: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      department: user.department,
      agentStatus: user.agentStatus,
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

    const config = await User.findOne({ role: 'SUPER_ADMIN' }).lean();
    const expiryMinutes = config?.otpTime || 10;
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    user.otp = otpCode;
    user.otpExpiry = new Date(Date.now() + expiryMinutes * 60 * 1000);
    await user.save();

    await sendOTP(user.email, otpCode, expiryMinutes);

    res.status(200).json({ 
      success: true, 
      message: 'OTP sent successfully to your email'
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, otp, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.otp || !user.otpExpiry) {
      return res.status(400).json({ message: 'No OTP generated for this user' });
    }

    if (Date.now() > user.otpExpiry.getTime()) {
      return res.status(400).json({ message: 'OTP has expired' });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    user.password = password;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.status(200).json({ success: true, message: 'Password reset successful' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const verifyRegistration = async (req: Request, res: Response) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({ message: 'User ID and OTP are required' });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (user.otpExpiry && new Date() > new Date(user.otpExpiry)) {
      return res.status(400).json({ message: 'OTP has expired' });
    }

    // Mark as verified and clear OTP
    user.isEmailVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.json({
      _id: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      department: user.department,
      companyName: user.companyName,
      supplierOwnerId: user.supplierOwnerId,
      token: generateToken(user.id),
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
