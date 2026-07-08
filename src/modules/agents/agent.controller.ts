import { Response } from 'express';
import AgentProfile from './agent.model';
import User from '../users/user.model';
import { AuthRequest } from '../../middleware/auth.middleware';

// @desc    Create or Update Agent Profile (Business details)
// @route   POST /api/agents/profile
// @access  Private (AGENT only)
export const manageAgentProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { gstNumber, panNumber, agencyName } = req.body;
    
    // Check if agent profile already exists
    let agentProfile = await AgentProfile.findOne({ user: req.user._id });

    if (agentProfile) {
      // Update
      agentProfile.gstNumber = gstNumber || agentProfile.gstNumber;
      agentProfile.panNumber = panNumber || agentProfile.panNumber;
      agentProfile.agencyName = agencyName || agentProfile.agencyName;
      
      const updatedProfile = await agentProfile.save();
      return res.json(updatedProfile);
    } else {
      // Create
      agentProfile = await AgentProfile.create({
        user: req.user._id,
        gstNumber,
        panNumber,
        agencyName,
        walletBalance: 0,
        creditLimit: 0,
        commissionPercentage: 5, // Default commission, configurable by admin
      });
      return res.status(201).json(agentProfile);
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get Agent Wallet & Profile
// @route   GET /api/agents/wallet
// @access  Private (AGENT only)
export const getAgentWallet = async (req: AuthRequest, res: Response) => {
  try {
    const agentProfile = await AgentProfile.findOne({ user: req.user._id });

    if (!agentProfile) {
      return res.status(404).json({ message: 'Agent profile not found. Please complete business setup.' });
    }

    res.json({
      agencyName: agentProfile.agencyName,
      walletBalance: agentProfile.walletBalance,
      creditLimit: agentProfile.creditLimit,
      commissionPercentage: agentProfile.commissionPercentage,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
