import { Request, Response } from 'express';
import User from './user.model';
import Booking from '../bookings/booking.model';
import Transaction from '../wallet/wallet.model';
import { sendAccountApprovedEmail } from '../../utils/email.service';
import multer from 'multer';

export const getUsers = async (req: Request, res: Response) => {
  try {
    const filter: any = { roles: { $ne: 'SUPER_ADMIN' } };
    if (req.query.role && req.query.role !== 'SUPER_ADMIN') {
      const roles = (req.query.role as string).split(',');
      if (roles.length > 1) {
        filter.roles = { $in: roles };
      } else {
        filter.roles = req.query.role;
      }
    }
    
    if (req.query.agentStatus) {
      filter.agentStatus = req.query.agentStatus;
    }
    
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const totalRecords = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('-password')
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
      currentPage: page,
      limit,
      data: users
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);

    // Run aggregations directly in MongoDB engine to strictly keep Node.js heap < 100KB
    const [totalUsers, agentFundsAgg, bookingStatsAgg] = await Promise.all([
      User.countDocuments({ roles: { $ne: 'SUPER_ADMIN' } }),
      User.aggregate([
        { $match: { roles: 'B2B_AGENT' } },
        {
          $group: {
            _id: null,
            totalWallet: { $sum: { $ifNull: ['$walletBalance', 0] } },
            totalCredit: { $sum: { $ifNull: ['$creditBalance', 0] } }
          }
        }
      ]),
      Booking.aggregate([
        { $match: { status: 'CONFIRMED' } },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  totalBookings: { $sum: 1 },
                  totalRevenue: { $sum: { $ifNull: ['$totalAmount', 0] } }
                }
              }
            ],
            byCategory: [
              {
                $group: {
                  _id: '$type',
                  revenue: { $sum: { $ifNull: ['$totalAmount', 0] } }
                }
              }
            ],
            byMonth: [
              {
                $match: {
                  createdAt: { $gte: startOfYear }
                }
              },
              {
                $group: {
                  _id: { $month: '$createdAt' },
                  revenue: { $sum: { $ifNull: ['$totalAmount', 0] } }
                }
              }
            ],
            topAgents: [
              { $match: { user: { $exists: true, $ne: null } } },
              {
                $group: {
                  _id: '$user',
                  sales: { $sum: 1 }
                }
              },
              { $sort: { sales: -1 } },
              { $limit: 5 }
            ]
          }
        }
      ])
    ]);

    const totalWalletBalance = agentFundsAgg[0]?.totalWallet || 0;
    const totalCreditBalance = agentFundsAgg[0]?.totalCredit || 0;
    const systemFunds = totalWalletBalance + totalCreditBalance;

    const bookingFacet = bookingStatsAgg[0] || {};
    const totalBookings = bookingFacet.totals?.[0]?.totalBookings || 0;
    const totalRevenue = bookingFacet.totals?.[0]?.totalRevenue || 0;

    // Category breakdown
    const categoryRevMap: Record<string, number> = { FLIGHT: 0, HOTEL: 0, PACKAGE: 0, BUS: 0 };
    (bookingFacet.byCategory || []).forEach((c: any) => {
      if (c._id && categoryRevMap[c._id] !== undefined) {
        categoryRevMap[c._id] = c.revenue;
      }
    });

    const revenueByCategory = [
      { name: 'Flights', value: categoryRevMap.FLIGHT, color: '#3b82f6' },
      { name: 'Hotels', value: categoryRevMap.HOTEL, color: '#10b981' },
      { name: 'Packages', value: categoryRevMap.PACKAGE, color: '#8b5cf6' },
      { name: 'Buses', value: categoryRevMap.BUS, color: '#f59e0b' },
    ].filter(item => item.value > 0);

    // Monthly breakdown
    const monthlyMap: Record<number, number> = {};
    (bookingFacet.byMonth || []).forEach((m: any) => {
      monthlyMap[m._id] = m.revenue; // m._id is 1-12
    });

    const monthlyRevenue = months.map((name, idx) => ({
      name,
      revenue: monthlyMap[idx + 1] || 0
    }));

    // Top Agents populated names
    const topAgentGroups = bookingFacet.topAgents || [];
    const topAgentUserIds = topAgentGroups.map((a: any) => a._id);
    const topAgentUsers = topAgentUserIds.length > 0
      ? await User.find({ _id: { $in: topAgentUserIds } }).select('name companyName').lean()
      : [];
    const userMap = new Map(topAgentUsers.map((u: any) => [u._id.toString(), u.companyName || u.name]));

    const topAgents = topAgentGroups.map((a: any) => ({
      name: userMap.get(a._id.toString()) || 'Agent',
      sales: a.sales
    }));

    res.json({
      totalUsers,
      totalBookings,
      totalRevenue,
      systemFunds,
      totalWalletBalance,
      totalCreditBalance,
      revenueByCategory,
      monthlyRevenue,
      topAgents
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllBookings = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const filter = {};
    const totalRecords = await Booking.countDocuments(filter);

    const bookings = await Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email phone')
      .lean();

    res.json({
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
      currentPage: page,
      limit,
      data: bookings
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to fetch bookings' });
  }
};

export const approveAgent = async (req: Request, res: Response) => {
  try {
    const agentId = req.params.id;
    const { status } = req.body; // 'APPROVED' | 'REJECTED'
    const agent = await User.findById(agentId);

    if (!agent || !agent.roles.includes('B2B_AGENT')) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    if (agent.agentStatus === status) {
      return res.status(400).json({ message: `Agent is already ${status}` });
    }

    agent.agentStatus = status;
    agent.isApproved = status === 'APPROVED';
    await agent.save();

    if (status === 'APPROVED') {
      try {
        await sendAccountApprovedEmail(agent.email, agent.name || 'Agent');
      } catch (e) {
        console.error('Failed to send account approval email:', e);
      }
    }

    res.json({ message: `Agent ${status.toLowerCase()} successfully`, agent });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { 
      role, roles, department, name, phone, companyName, isActive, agentStatus,
      creditBalance, resultExpiryTime, otpTime, requiredTravelDate, 
      extendedDomain, irctcAgentId, displayOnProfileIcon, referredBy, reportingTo
    } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (roles && Array.isArray(roles)) {
      user.roles = roles;
    } else if (role) {
      user.roles = [role];
    }
    user.department = (roles?.includes('SUB_ADMIN') || role === 'SUB_ADMIN') ? (department !== undefined ? department : user.department) : null;
    if (name) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (companyName !== undefined) user.companyName = companyName;
    if (isActive !== undefined) user.isActive = isActive;
    if (agentStatus !== undefined) user.agentStatus = agentStatus;
    if (creditBalance !== undefined) user.creditBalance = creditBalance;
    if (resultExpiryTime !== undefined) user.resultExpiryTime = resultExpiryTime;
    if (otpTime !== undefined) user.otpTime = otpTime;
    if (requiredTravelDate !== undefined) user.requiredTravelDate = requiredTravelDate;
    if (extendedDomain !== undefined) user.extendedDomain = extendedDomain;
    if (irctcAgentId !== undefined) user.irctcAgentId = irctcAgentId;
    if (displayOnProfileIcon !== undefined) user.displayOnProfileIcon = displayOnProfileIcon;
    if (referredBy !== undefined) user.referredBy = referredBy;
    if (reportingTo !== undefined) user.reportingTo = reportingTo;

    await user.save();

    res.json({
      _id: user._id,
      name: user.name,
      roles: user.roles,
      department: user.department,
      isActive: user.isActive,
      agentStatus: user.agentStatus
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new Sub Admin
// @route   POST /api/admin/subadmins
// @access  Private (Super Admin)
export const createSubAdmin = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password, department } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const subAdmin = await User.create({
      name,
      email,
      phone,
      password,
      roles: ['SUB_ADMIN'],
      department,
      isApproved: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    res.status(201).json({
      _id: subAdmin.id,
      name: subAdmin.name,
      email: subAdmin.email,
      roles: subAdmin.roles,
      department: subAdmin.department,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new Agent or Platform User
// @route   POST /api/admin/agents or POST /api/admin/users
// @access  Private (Super Admin)
export const createAgent = async (req: Request, res: Response) => {
  try {
    const { name, firstName, lastName, email, phone, password, companyName, roles, role, address, officeAddress, city } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const assignedRoles = roles && Array.isArray(roles) && roles.length > 0 
      ? roles 
      : (role ? [role] : ['B2B_AGENT']);

    const fullName = name || `${firstName || ''} ${lastName || ''}`.trim() || email.split('@')[0];

    const agent = await User.create({
      name: fullName,
      firstName: firstName || fullName.split(' ')[0],
      lastName: lastName || fullName.split(' ').slice(1).join(' '),
      email,
      phone,
      password,
      roles: assignedRoles,
      companyName,
      officeAddress: address || officeAddress,
      city,
      isApproved: true,
      agentStatus: 'APPROVED',
      isEmailVerified: true,
      isPhoneVerified: true,
      isActive: true,
    });

    res.status(201).json({
      success: true,
      _id: agent.id,
      name: agent.name,
      email: agent.email,
      roles: agent.roles,
      companyName: agent.companyName,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.roles.includes('SUPER_ADMIN')) {
      return res.status(403).json({ message: 'Cannot delete SUPER_ADMIN' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

import { OfflineTopUpRequest } from '../wallet/offlineTopUp.model';
import { WithdrawalRequest } from '../wallet/withdrawalRequest.model';
import { OfflineBooking } from '../bookings/offlineBooking.model';

export const getPendingQueue = async (req: Request, res: Response) => {
  try {
    const agents = await User.find({ agentStatus: 'PENDING' }).select('name email phone createdAt companyName').lean();
    const topups = await OfflineTopUpRequest.find({ status: 'PENDING' }).populate('user', 'name companyName').lean();
    const withdrawals = await WithdrawalRequest.find({ status: 'PENDING' }).populate('user', 'name companyName').lean();
    const offlineBookings = await OfflineBooking.find({ status: 'PENDING' }).populate('user', 'name companyName').lean();

    res.json({
      agents,
      topups,
      withdrawals,
      offlineBookings,
      summary: {
        agents: agents.length,
        topups: topups.length,
        withdrawals: withdrawals.length,
        offlineBookings: offlineBookings.length,
        total: agents.length + topups.length + withdrawals.length + offlineBookings.length
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get Platform Global Info
// @route   GET /api/admin/platform-info
// @access  Public
export const getPlatformInfo = async (req: Request, res: Response) => {
  try {
    const adminUser = await User.findOne({ roles: 'SUPER_ADMIN' }).lean();
    if (!adminUser) {
      return res.status(404).json({ message: 'Platform info not available' });
    }
    
    res.json({
      companyName: adminUser.companyName || 'TRIPPECHALO INDIA PRIVATE LIMITED',
      email: adminUser.email || 'trippechaloindia@gmail.com',
      officePhone: adminUser.officePhone || '9555934205',
      officeAddress: adminUser.officeAddress || 'D 42 Sector 108 Noida 201304',
      panNumber: adminUser.panNumber || 'AAMCT8505A',
      gstn: adminUser.gstn || '',
      website: adminUser.website || 'trippechalo.com',
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

