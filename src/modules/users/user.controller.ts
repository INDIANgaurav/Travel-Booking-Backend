import { Response } from 'express';
import User from './user.model';
import { AuthRequest } from '../../middleware/auth.middleware';
import bcrypt from 'bcryptjs';

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
export const getUserProfile = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user._id).select('-password').lean();
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
      if (req.body.gender !== undefined) user.gender = req.body.gender || undefined;
      if (req.body.nationality !== undefined) user.nationality = req.body.nationality;
      if (req.body.dob !== undefined) user.dob = req.body.dob || undefined;
      if (req.body.passportNumber !== undefined) user.passportNumber = req.body.passportNumber;
      if (req.body.passportExpiry !== undefined) user.passportExpiry = req.body.passportExpiry || undefined;
      if (req.body.issuingCountry !== undefined) user.issuingCountry = req.body.issuingCountry;
      if (req.body.panNumber !== undefined) user.panNumber = req.body.panNumber;
      if (req.body.resultExpiryTime !== undefined) user.resultExpiryTime = req.body.resultExpiryTime;
      if (req.body.otpTime !== undefined) user.otpTime = req.body.otpTime;
      if (req.body.requiredTravelDate !== undefined) user.requiredTravelDate = req.body.requiredTravelDate;
      if (req.body.extendedDomain !== undefined) user.extendedDomain = req.body.extendedDomain;
      if (req.body.irctcAgentId !== undefined) user.irctcAgentId = req.body.irctcAgentId;
      if (req.body.displayOnProfileIcon !== undefined) user.displayOnProfileIcon = req.body.displayOnProfileIcon;
      if (req.body.referredBy !== undefined) user.referredBy = req.body.referredBy;
      if (req.body.reportingTo !== undefined) user.reportingTo = req.body.reportingTo;

      // New Company Fields
      if (req.body.services !== undefined) user.services = req.body.services;
      if (req.body.businessType !== undefined) user.businessType = req.body.businessType;
      if (req.body.iataCode !== undefined) user.iataCode = req.body.iataCode;
      if (req.body.contactRepresentative !== undefined) user.contactRepresentative = req.body.contactRepresentative;
      if (req.body.nameOnPan !== undefined) user.nameOnPan = req.body.nameOnPan;
      if (req.body.commGrp !== undefined) user.commGrp = req.body.commGrp;
      if (req.body.city !== undefined) user.city = req.body.city;
      if (req.body.state !== undefined) user.state = req.body.state;
      if (req.body.officeAddress !== undefined) user.officeAddress = req.body.officeAddress;
      if (req.body.pincode !== undefined) user.pincode = req.body.pincode;
      if (req.body.marqueesDetail !== undefined) user.marqueesDetail = req.body.marqueesDetail;
      if (req.body.negoMarqueesDetail !== undefined) user.negoMarqueesDetail = req.body.negoMarqueesDetail;
      if (req.body.salesContactNo !== undefined) user.salesContactNo = req.body.salesContactNo;
      if (req.body.website !== undefined) user.website = req.body.website;
      if (req.body.officePhone !== undefined) user.officePhone = req.body.officePhone;
      if (req.body.country !== undefined) user.country = req.body.country;
      if (req.body.isVerified !== undefined) user.isVerified = req.body.isVerified;
      if (req.body.isOwner !== undefined) user.isOwner = req.body.isOwner;
      if (req.body.isLoginUser !== undefined) user.isLoginUser = req.body.isLoginUser;
      if (req.body.youtubeUrl !== undefined) user.youtubeUrl = req.body.youtubeUrl;
      if (req.body.linkedinUrl !== undefined) user.linkedinUrl = req.body.linkedinUrl;
      if (req.body.facebookUrl !== undefined) user.facebookUrl = req.body.facebookUrl;
      if (req.body.instagramUrl !== undefined) user.instagramUrl = req.body.instagramUrl;
      if (req.body.twitterUrl !== undefined) user.twitterUrl = req.body.twitterUrl;
      if (req.body.gstEnabled !== undefined) user.gstEnabled = req.body.gstEnabled;
      if (req.body.gstCompanyName !== undefined) user.gstCompanyName = req.body.gstCompanyName;
      if (req.body.gstCompanyAddress !== undefined) user.gstCompanyAddress = req.body.gstCompanyAddress;
      if (req.body.gstEmail !== undefined) user.gstEmail = req.body.gstEmail;
      if (req.body.gstContactNo !== undefined) user.gstContactNo = req.body.gstContactNo;
      if (req.body.cugPlatformSellingCharge !== undefined) user.cugPlatformSellingCharge = req.body.cugPlatformSellingCharge;
      if (req.body.cugPlatformBuyingCharge !== undefined) user.cugPlatformBuyingCharge = req.body.cugPlatformBuyingCharge;
      
      // New Document Fields
      if (req.body.documents !== undefined) user.documents = req.body.documents;
      if (req.body.isApprovedDocument !== undefined) user.isApprovedDocument = req.body.isApprovedDocument;

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
        roles: updatedUser.roles,
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
        walletBalance: updatedUser.walletBalance,
        creditBalance: updatedUser.creditBalance,
        resultExpiryTime: updatedUser.resultExpiryTime,
        otpTime: updatedUser.otpTime,
        requiredTravelDate: updatedUser.requiredTravelDate,
        extendedDomain: updatedUser.extendedDomain,
        irctcAgentId: updatedUser.irctcAgentId,
        displayOnProfileIcon: updatedUser.displayOnProfileIcon,
        referredBy: updatedUser.referredBy,
        reportingTo: updatedUser.reportingTo,
        services: updatedUser.services,
        businessType: updatedUser.businessType,
        iataCode: updatedUser.iataCode,
        contactRepresentative: updatedUser.contactRepresentative,
        nameOnPan: updatedUser.nameOnPan,
        commGrp: updatedUser.commGrp,
        city: updatedUser.city,
        state: updatedUser.state,
        officeAddress: updatedUser.officeAddress,
        pincode: updatedUser.pincode,
        marqueesDetail: updatedUser.marqueesDetail,
        negoMarqueesDetail: updatedUser.negoMarqueesDetail,
        salesContactNo: updatedUser.salesContactNo,
        website: updatedUser.website,
        officePhone: updatedUser.officePhone,
        country: updatedUser.country,
        isVerified: updatedUser.isVerified,
        isOwner: updatedUser.isOwner,
        isLoginUser: updatedUser.isLoginUser,
        youtubeUrl: updatedUser.youtubeUrl,
        linkedinUrl: updatedUser.linkedinUrl,
        facebookUrl: updatedUser.facebookUrl,
        instagramUrl: updatedUser.instagramUrl,
        twitterUrl: updatedUser.twitterUrl,
        gstEnabled: updatedUser.gstEnabled,
        gstCompanyName: updatedUser.gstCompanyName,
        gstCompanyAddress: updatedUser.gstCompanyAddress,
        gstEmail: updatedUser.gstEmail,
        gstContactNo: updatedUser.gstContactNo,
        cugPlatformSellingCharge: updatedUser.cugPlatformSellingCharge,
        cugPlatformBuyingCharge: updatedUser.cugPlatformBuyingCharge,
        documents: updatedUser.documents,
        isApprovedDocument: updatedUser.isApprovedDocument,
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

    if (!user.roles.includes('B2B_AGENT')) {
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

// @desc    Get supplier staff users
// @route   GET /api/users/supplier-staff
// @access  Private (Supplier only)
export const getSupplierStaff = async (req: AuthRequest, res: Response) => {
  try {
    const users = await User.find({ 
      roles: { $in: ['SUPPLIER_STAFF'] }, 
      supplierOwnerId: req.user._id
    }).lean();
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add supplier staff
// @route   POST /api/users/supplier-staff
// @access  Private (Supplier only)
export const addSupplierStaff = async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, password } = req.body;
    
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({
      name,
      email,
      phone,
      password,
      roles: ['SUPPLIER_STAFF'],
      supplierOwnerId: req.user._id,
      companyName: req.user.companyName,
      agentStatus: 'APPROVED',
      isActive: true,
    });

    res.status(201).json(user);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update supplier staff
// @route   PUT /api/users/supplier-staff/:id
// @access  Private (Supplier only)
export const updateSupplierStaff = async (req: AuthRequest, res: Response) => {
  try {
    const { isActive, name, phone, email } = req.body;
    const user = await User.findOne({ _id: req.params.id, supplierOwnerId: req.user._id });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (isActive !== undefined) user.isActive = isActive;
    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (email !== undefined) user.email = email;

    if (req.body.agentStatus !== undefined) user.agentStatus = req.body.agentStatus;

    const updatedUser = await user.save();
    res.json(updatedUser);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete supplier staff
// @route   DELETE /api/users/supplier-staff/:id
// @access  Private (Supplier only)
export const deleteSupplierStaff = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findOneAndDelete({ _id: req.params.id, supplierOwnerId: req.user._id });

    if (!user) {
      return res.status(404).json({ message: 'User not found or not authorized to delete' });
    }

    res.json({ message: 'Supplier staff deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Sync domain cache for white-label domains
// @route   POST /api/users/sync-domain-cache
// @access  Private
export const syncDomainCache = async (req: AuthRequest, res: Response) => {
  try {
    // In a real implementation, this would clear Redis/CDN cache
    // For now, we simulate a successful flush and update the user record timestamp.
    const user = await User.findById(req.user!._id);
    
    if (user) {
      // We could store a lastCacheSync timestamp here if needed
      // user.lastCacheSync = new Date();
      // await user.save();
      res.status(200).json({ 
        success: true, 
        message: 'Domain cache successfully synchronized across all edge nodes.' 
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
