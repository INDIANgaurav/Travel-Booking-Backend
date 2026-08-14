import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import User from '../users/user.model';
import Transaction from './wallet.model';
import Razorpay from 'razorpay';
import crypto from 'crypto';

// @desc    Get user wallet and transactions
// @route   GET /api/wallet
// @access  Private
export const getWallet = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const transactions = await Transaction.find({ user: req.user._id }).sort({ date: -1 }).limit(10).lean();

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

// @desc    Create Razorpay Order for Wallet Top-up
// @route   POST /api/wallet/create-order
// @access  Private
export const createTopUpOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { amount, paymentMethod } = req.body; // amount is the base top-up amount
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    // Calculate Surcharge based on payment method
    let surcharge = 0;
    if (paymentMethod && paymentMethod !== 'UPI') {
      surcharge = amount * 0.02; // 2% convenience fee for non-UPI
    }
    const totalPayable = Math.round(amount + surcharge);

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET || ''
    });

    const options = {
      amount: totalPayable * 100, // in paise
      currency: 'INR',
      receipt: `w_${req.user._id.toString().slice(-6)}_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);
    
    res.json({
      orderId: order.id,
      amount: totalPayable,
      baseAmount: amount,
      surcharge: surcharge,
      currency: order.currency
    });
  } catch (error: any) {
    console.error('Razorpay Error:', error);
    res.status(500).json({ message: error.message || 'Failed to create order' });
  }
};

// @desc    Verify Wallet Top-up Payment
// @route   POST /api/wallet/verify-payment
// @access  Private
export const verifyTopUpPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      baseAmount,
      surcharge,
      paymentMethod
    } = req.body;

    const secret = process.env.RAZORPAY_KEY_SECRET || '';

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generated_signature = hmac.digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ message: 'Invalid payment signature' });
    }

    // Find User
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Update wallet balance with the BASE amount only
    user.walletBalance += Number(baseAmount);
    await user.save();

    // Log the transaction
    const transaction = await Transaction.create({
      user: user._id,
      type: 'CREDIT',
      amount: Number(baseAmount),
      description: `Wallet Top-up via ${paymentMethod || 'Razorpay'}`,
      paymentMethod: paymentMethod || 'RAZORPAY',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      surcharge: Number(surcharge)
    });

    res.json({
      message: 'Payment verified and wallet credited successfully',
      balance: user.walletBalance,
      transaction
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Verification failed' });
  }
};

