import { Request, Response } from 'express';
import User from './user.model';

export const getUsers = async (req: Request, res: Response) => {
  try {
    const filter: any = { role: { $ne: 'SUPER_ADMIN' } };
    if (req.query.role && req.query.role !== 'SUPER_ADMIN') {
      filter.role = req.query.role;
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

import Booking from '../bookings/booking.model';

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

    if (!agent || agent.role !== 'B2B_AGENT') {
      return res.status(404).json({ message: 'Agent not found' });
    }

    if (agent.agentStatus === status) {
      return res.status(400).json({ message: `Agent is already ${status}` });
    }

    agent.agentStatus = status;
    agent.isApproved = status === 'APPROVED';
    await agent.save();

    res.json({ message: `Agent ${status.toLowerCase()} successfully`, agent });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { role, department, name, phone, companyName, isActive, agentStatus } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.role = role || user.role;
    user.department = role === 'SUB_ADMIN' ? (department !== undefined ? department : user.department) : null;
    if (name) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (companyName !== undefined) user.companyName = companyName;
    if (isActive !== undefined) user.isActive = isActive;
    if (agentStatus !== undefined) user.agentStatus = agentStatus;

    await user.save();

    res.json({
      _id: user._id,
      name: user.name,
      role: user.role,
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
      role: 'SUB_ADMIN',
      department,
      isApproved: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    res.status(201).json({
      _id: subAdmin.id,
      name: subAdmin.name,
      email: subAdmin.email,
      role: subAdmin.role,
      department: subAdmin.department,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new Agent
// @route   POST /api/admin/agents
// @access  Private (Super Admin)
export const createAgent = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password, companyName } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const agent = await User.create({
      name,
      email,
      phone,
      password,
      role: 'B2B_AGENT',
      companyName,
      isApproved: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    res.status(201).json({
      _id: agent.id,
      name: agent.name,
      email: agent.email,
      role: agent.role,
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
    
    if (user.role === 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Cannot delete a SUPER_ADMIN' });
    }
    
    await User.deleteOne({ _id: user._id });
    res.json({ message: 'User removed successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
