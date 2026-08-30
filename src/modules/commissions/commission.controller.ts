import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { CommissionPlan, CommissionGroup } from './commission.model';

// @desc    Create a commission plan
// @route   POST /api/commissions
// @access  Private (Admin)
export const createCommissionPlan = async (req: AuthRequest, res: Response) => {
  try {
    const { name, priority, type, category, airline, status, fees } = req.body;
    
    if (!name || !type || !category) {
      return res.status(400).json({ message: 'Name, Type and Category are required' });
    }

    const plan = new CommissionPlan({
      name,
      priority,
      type,
      category,
      airline: airline || 'ALL',
      status: status || false,
      fees: fees || {}
    });

    await plan.save();
    res.status(201).json(plan);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all commission plans
// @route   GET /api/commissions
// @access  Private (Admin)
export const getCommissionPlans = async (req: AuthRequest, res: Response) => {
  try {
    const plans = await CommissionPlan.find().sort({ createdAt: -1 });
    res.json(plans);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a commission plan
// @route   DELETE /api/commissions/:id
// @access  Private (Admin)
export const deleteCommissionPlan = async (req: AuthRequest, res: Response) => {
  try {
    const plan = await CommissionPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    
    await plan.deleteOne();
    res.json({ message: 'Plan deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a commission group
// @route   POST /api/commissions/groups
// @access  Private (Admin)
export const createCommissionGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, planName } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Group Name is required' });
    }

    const code = `GRP-${Date.now().toString().slice(-6)}`;

    const group = new CommissionGroup({
      name,
      description,
      planName,
      code
    });

    await group.save();
    res.status(201).json(group);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all commission groups
// @route   GET /api/commissions/groups
// @access  Private (Admin)
export const getCommissionGroups = async (req: AuthRequest, res: Response) => {
  try {
    const groups = await CommissionGroup.find().sort({ createdAt: -1 });
    res.json(groups);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
