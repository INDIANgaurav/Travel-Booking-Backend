import { Request, Response } from 'express';
import User from './user.model';

export const getUsers = async (req: Request, res: Response) => {
  try {
    const filter: any = { role: { $ne: 'SUPER_ADMIN' } };
    if (req.query.role && req.query.role !== 'SUPER_ADMIN') {
      filter.role = req.query.role;
    }
    
    const users = await User.find(filter).select('-password');
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

import Booking from '../bookings/booking.model';

export const getAllBookings = async (req: Request, res: Response) => {
  try {
    const bookings = await Booking.find({})
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to fetch bookings' });
  }
};

export const approveAgent = async (req: Request, res: Response) => {
  try {
    const agentId = req.params.id;
    const agent = await User.findById(agentId);

    if (!agent || agent.role !== 'AGENT') {
      return res.status(404).json({ message: 'Agent not found' });
    }

    if (agent.isApproved) {
      return res.status(400).json({ message: 'Agent is already approved' });
    }

    agent.isApproved = true;
    await agent.save();

    res.json({ message: 'Agent approved successfully', agent });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateUserRole = async (req: Request, res: Response) => {
  try {
    const { role, department } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.role = role || user.role;
    user.department = role === 'SUB_ADMIN' ? (department || user.department) : null;

    await user.save();

    res.json({
      _id: user._id,
      name: user.name,
      role: user.role,
      department: user.department
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
