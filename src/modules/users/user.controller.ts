import { Response } from 'express';
import User from './user.model';
import { AuthRequest } from '../../middleware/auth.middleware';
import bcrypt from 'bcryptjs';

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
export const getUserProfile = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
export const updateUserProfile = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.name = req.body.name || user.name;
      user.phone = req.body.phone || user.phone;
      user.avatar = req.body.avatar || user.avatar;
      
      // New profile fields
      if (req.body.firstName !== undefined) user.firstName = req.body.firstName;
      if (req.body.lastName !== undefined) user.lastName = req.body.lastName;
      if (req.body.gender !== undefined) user.gender = req.body.gender;
      if (req.body.nationality !== undefined) user.nationality = req.body.nationality;
      if (req.body.dob !== undefined) user.dob = req.body.dob;
      if (req.body.passportNumber !== undefined) user.passportNumber = req.body.passportNumber;
      if (req.body.passportExpiry !== undefined) user.passportExpiry = req.body.passportExpiry;
      if (req.body.issuingCountry !== undefined) user.issuingCountry = req.body.issuingCountry;
      if (req.body.panNumber !== undefined) user.panNumber = req.body.panNumber;

      // Note: We don't update email here usually, or if we do, we need to re-verify
      if (req.body.email && req.body.email !== user.email) {
        user.email = req.body.email;
        user.isEmailVerified = false; // Reset verification
      }

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        avatar: updatedUser.avatar,
        role: updatedUser.role,
        isEmailVerified: updatedUser.isEmailVerified,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        gender: updatedUser.gender,
        nationality: updatedUser.nationality,
        dob: updatedUser.dob,
        passportNumber: updatedUser.passportNumber,
        passportExpiry: updatedUser.passportExpiry,
        issuingCountry: updatedUser.issuingCountry,
        panNumber: updatedUser.panNumber,
        agentStatus: updatedUser.agentStatus,
        companyName: updatedUser.companyName,
        companyRole: updatedUser.companyRole,
        employeeSize: updatedUser.employeeSize,
        gstn: updatedUser.gstn,
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Change Password
// @route   PUT /api/users/change-password
// @access  Private
export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    if (user && (await user.matchPassword(oldPassword))) {
      user.password = newPassword;
      await user.save();
      res.json({ message: 'Password updated successfully' });
    } else {
      res.status(400).json({ message: 'Invalid old password' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Simulate OTP Verification
// @route   POST /api/users/verify
// @access  Private
export const verifyOtp = async (req: AuthRequest, res: Response) => {
  try {
    const { type, otp } = req.body; // type: 'email' or 'phone'
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log(`[OTP SIMULATION] Verifying ${type} for user ${user.email} with OTP: ${otp}`);

    // Simulate OTP check (Assume '123456' is the correct OTP for testing)
    if (otp === '123456') {
      if (type === 'email') user.isEmailVerified = true;
      if (type === 'phone') user.isPhoneVerified = true;
      
      await user.save();
      res.json({ message: `${type} verified successfully` });
    } else {
      res.status(400).json({ message: 'Invalid OTP' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add Saved Traveller
// @route   POST /api/users/travellers
// @access  Private
export const addSavedTraveller = async (req: AuthRequest, res: Response) => {
  try {
    const { firstName, lastName, dob, gender, passportNumber } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.savedTravellers.push({
      firstName,
      lastName,
      dob,
      gender,
      passportNumber
    });

    const updatedUser = await user.save();
    res.status(201).json(updatedUser.savedTravellers);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Submit Agent Onboarding Details
// @route   PUT /api/users/agent/onboarding
// @access  Private (Agent only)
export const submitAgentOnboarding = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role !== 'TRAVEL_AGENT') {
      return res.status(403).json({ message: 'Only Travel Agents can perform this action' });
    }

    const { companyName, companyRole, employeeSize, gstn, name, phone } = req.body;

    user.companyName = companyName || user.companyName;
    user.companyRole = companyRole || user.companyRole;
    user.employeeSize = employeeSize || user.employeeSize;
    user.gstn = gstn || user.gstn;
    if (name) user.name = name;
    if (phone) user.phone = phone;

    user.agentStatus = 'PENDING';
    await user.save();

    res.json({ message: 'Onboarding details submitted. Pending admin approval.', user });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
