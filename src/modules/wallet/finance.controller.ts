import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import AdminBank from './adminBank.model';
import PaymentRecord from './paymentRecord.model';
import User from '../users/user.model';
import Transaction from './wallet.model';

// --- Banks ---

export const addBank = async (req: AuthRequest, res: Response) => {
  try {
    const bank = new AdminBank({ ...req.body, createdBy: req.user._id });
    await bank.save();
    res.status(201).json(bank);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getBanks = async (req: AuthRequest, res: Response) => {
  try {
    const banks = await AdminBank.find({ isActive: true }).populate('createdBy', 'firstName lastName name');
    res.json(banks);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteBank = async (req: AuthRequest, res: Response) => {
  try {
    const bank = await AdminBank.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!bank) return res.status(404).json({ message: 'Bank not found' });
    res.json({ message: 'Bank deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// --- Payments ---

export const raisePayment = async (req: AuthRequest, res: Response) => {
  try {
    const { agency, depositAmount, type } = req.body;
    
    // Validation for OUTGOING payments
    if (type === 'OUTGOING') {
      const user = await User.findById(agency);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (user.walletBalance < depositAmount) {
        return res.status(400).json({ message: `Insufficient wallet balance. User has only ₹${user.walletBalance}` });
      }
    }

    const payment = new PaymentRecord({
      ...req.body,
      raisedBy: req.user._id,
      status: 'PENDING'
    });
    await payment.save();
    res.status(201).json(payment);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getPayments = async (req: AuthRequest, res: Response) => {
  try {
    const { type, status } = req.query;
    const query: any = {};
    if (type) query.type = type;
    if (status) query.status = status;

    const payments = await PaymentRecord.find(query)
      .populate('agency', 'firstName lastName name companyName')
      .populate('adminBank', 'bankName accountNo')
      .populate('raisedBy', 'firstName lastName name')
      .sort({ createdAt: -1 });
      
    res.json(payments);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updatePaymentStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const payment = await PaymentRecord.findById(id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (payment.status !== 'PENDING') return res.status(400).json({ message: 'Payment is already processed' });

    payment.status = status;
    payment.processedBy = req.user._id;
    await payment.save();

    if (status === 'APPROVED') {
      const user = await User.findById(payment.agency);
      if (user) {
        if (payment.type === 'INCOMING') {
          user.walletBalance += payment.depositAmount;
          await Transaction.create({
            user: user._id,
            type: 'CREDIT',
            amount: payment.depositAmount,
            description: `Payment ${payment.transactionNo} approved`,
            paymentMethod: payment.paymentMode,
          });
        } else if (payment.type === 'OUTGOING') {
          // Check balance again at the time of approval!
          if (user.walletBalance < payment.depositAmount) {
            return res.status(400).json({ message: `Cannot approve: Insufficient wallet balance. User only has ₹${user.walletBalance}` });
          }
          user.walletBalance -= payment.depositAmount;
          await Transaction.create({
            user: user._id,
            type: 'DEBIT',
            amount: payment.depositAmount,
            description: `Payment ${payment.transactionNo} outgoing approved`,
            paymentMethod: payment.paymentMode,
          });
        }
        await user.save();
      }
    }

    res.json(payment);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
