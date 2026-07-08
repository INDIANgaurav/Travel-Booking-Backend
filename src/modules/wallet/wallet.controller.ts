import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import User from '../users/user.model';
import Transaction from './wallet.model';

// @desc    Get user wallet and transactions
// @route   GET /api/wallet
// @access  Private
export const getWallet = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const transactions = await Transaction.find({ user: req.user._id }).sort({ date: -1 }).limit(10);

    res.json({
      balance: user.walletBalance,
      currency: 'INR',
      transactions,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add money to wallet
// @route   POST /api/wallet/add
// @access  Private
export const addMoney = async (req: AuthRequest, res: Response) => {
  try {
    const { amount, paymentMethod } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.walletBalance += amount;
    await user.save();

    const transaction = await Transaction.create({
      user: user._id,
      type: 'CREDIT',
      amount,
      description: `Added via ${paymentMethod || 'UPI'}`,
      paymentMethod: paymentMethod || 'UPI',
    });

    res.json({
      balance: user.walletBalance,
      currency: 'INR',
      transaction
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
