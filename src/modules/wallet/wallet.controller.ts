import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import User from '../users/user.model';
import Transaction from './wallet.model';
import TopUpOrder from './topUpOrder.model';
import { OfflineTopUpRequest } from './offlineTopUp.model';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { createAdminNotification } from '../notifications/notification.controller';
import { WithdrawalRequest } from './withdrawalRequest.model';
import { sendWalletTopupEmail } from '../../utils/email.service';

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

// @desc    Add money to wallet (DEPRECATED & SECURED)
// @route   POST /api/wallet/add
// @access  Private (Blocked for security)
export const addMoney = async (req: AuthRequest, res: Response) => {
  console.warn(`[SECURITY ALERT] Unauthorized attempt to invoke /api/wallet/add by user: ${req.user?._id}`);
  return res.status(403).json({ 
    message: 'Direct balance addition is forbidden. Use official online top-up or admin recharge channels.' 
  });
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
      receipt: `w_${req.user._id.toString().slice(-6)}_${Date.now()}`,
      notes: {
        userId: req.user._id.toString(),
        baseAmount: String(amount),
        surcharge: String(surcharge),
        purpose: 'WALLET_TOPUP'
      }
    };

    const order = await razorpay.orders.create(options);
    
    // Persist TopUpOrder record server-side to prevent reliance on client payload or gateway notes
    await TopUpOrder.create({
      orderId: order.id,
      user: req.user._id,
      baseAmount: amount,
      surcharge,
      totalPayable,
      currency: order.currency,
      status: 'CREATED'
    });

    res.json({
      orderId: order.id,
      amount: totalPayable,
      baseAmount: amount,
      surcharge: surcharge,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error: any) {
    console.error('Razorpay Error:', error);
    res.status(500).json({ message: error.message || 'Failed to create order' });
  }
};

// @desc    Verify Wallet Top-up Payment (HARDENED & IDEMPOTENT)
// @route   POST /api/wallet/verify-payment
// @access  Private
export const verifyTopUpPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      paymentMethod
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: 'Missing payment verification credentials' });
    }

    // 1. Idempotency Check: Prevent duplicate crediting of the same payment ID
    const existingTx = await Transaction.findOne({ razorpayPaymentId: razorpay_payment_id });
    if (existingTx) {
      const existingUser = await User.findById(req.user._id);
      return res.status(200).json({
        message: 'Payment was already processed and credited',
        balance: existingUser?.walletBalance,
        transaction: existingTx,
        alreadyProcessed: true
      });
    }

    // 2. Cryptographic signature check with Timing-Safe comparison
    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generated_signature = hmac.digest('hex');

    const isSigValid = 
      generated_signature.length === razorpay_signature.length &&
      crypto.timingSafeEqual(Buffer.from(generated_signature), Buffer.from(razorpay_signature));

    if (!isSigValid) {
      return res.status(400).json({ message: 'Invalid payment signature' });
    }

    // 3. Atomic Database-Level Order Lock (prevents race condition between client and webhook)
    const topUpOrder = await TopUpOrder.findOneAndUpdate(
      { orderId: razorpay_order_id, user: req.user._id, status: 'CREATED' },
      { $set: { status: 'CREDITED', paymentId: razorpay_payment_id } },
      { new: true }
    );

    if (!topUpOrder) {
      const alreadyCredited = await TopUpOrder.findOne({ orderId: razorpay_order_id, status: 'CREDITED' });
      if (alreadyCredited) {
        const user = await User.findById(req.user._id);
        const tx = await Transaction.findOne({ razorpayOrderId: razorpay_order_id });
        return res.status(200).json({
          message: 'Payment was already processed and credited',
          balance: user?.walletBalance,
          transaction: tx,
          alreadyProcessed: true
        });
      }
      return res.status(404).json({ message: 'Valid uncredited top-up order not found for this user' });
    }

    // 4. Server-side Verification with Razorpay Gateway
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET || ''
    });

    let order: any;
    let payment: any;
    try {
      order = await razorpay.orders.fetch(razorpay_order_id);
      payment = await razorpay.payments.fetch(razorpay_payment_id);
    } catch (fetchErr: any) {
      console.error('Failed to fetch order/payment from Razorpay:', fetchErr);
      // Revert status to CREATED so user/webhook can retry
      await TopUpOrder.updateOne({ _id: topUpOrder._id }, { $set: { status: 'CREATED' } });
      return res.status(502).json({ message: 'Unable to verify order with payment gateway' });
    }

    if (!order || !payment) {
      await TopUpOrder.updateOne({ _id: topUpOrder._id }, { $set: { status: 'CREATED' } });
      return res.status(404).json({ message: 'Payment record not found at gateway' });
    }

    if (payment.order_id !== razorpay_order_id) {
      await TopUpOrder.updateOne({ _id: topUpOrder._id }, { $set: { status: 'FAILED' } });
      return res.status(400).json({ message: 'Payment ID does not match specified Order ID' });
    }

    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      await TopUpOrder.updateOne({ _id: topUpOrder._id }, { $set: { status: 'CREATED' } });
      return res.status(400).json({ message: `Payment is not in an authorized state: ${payment.status}` });
    }

    // 5. Amount derived from server-side persisted TopUpOrder
    const verifiedBaseAmount = topUpOrder.baseAmount;
    const verifiedSurcharge = topUpOrder.surcharge;

    // 5. Atomic Mongoose Session Transaction
    const mongoose = require('mongoose');
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const user = await User.findByIdAndUpdate(
        req.user._id,
        { $inc: { walletBalance: verifiedBaseAmount } },
        { session, new: true }
      );

      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'User not found' });
      }

      const transaction = await Transaction.create([{
        user: user._id,
        type: 'CREDIT',
        amount: verifiedBaseAmount,
        description: `Wallet Top-up via ${paymentMethod || payment.method?.toUpperCase() || 'Razorpay'}`,
        paymentMethod: paymentMethod || payment.method?.toUpperCase() || 'RAZORPAY',
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        surcharge: verifiedSurcharge
      }], { session });

      await session.commitTransaction();
      session.endSession();

      res.json({
        message: 'Payment verified and wallet credited successfully',
        balance: user.walletBalance,
        transaction: transaction[0]
      });
    } catch (txErr: any) {
      await session.abortTransaction();
      session.endSession();
      if (txErr.code === 11000) {
        return res.status(200).json({ message: 'Payment already credited concurrently' });
      }
      throw txErr;
    }
  } catch (error: any) {
    console.error('Wallet verify payment error:', error);
    res.status(500).json({ message: error.message || 'Verification failed' });
  }
};



// @desc    Submit an offline topup request (Agent)
// @route   POST /api/wallet/offline-topup
// @access  Private (B2B Agent)
export const submitOfflineTopUp = async (req: AuthRequest, res: Response) => {
  try {
    const { amount, paymentMode, referenceNumber, depositedBank, depositedAccountNo, chequeNumber, remarks } = req.body;
    
    if (!amount || !paymentMode) {
      return res.status(400).json({ message: 'Amount and payment mode are required' });
    }

    const request = new OfflineTopUpRequest({
      agentId: req.user._id,
      amount: Number(amount),
      paymentMode,
      referenceNumber,
      depositedBank,
      depositedAccountNo,
      chequeNumber,
      remarks,
      status: 'PENDING'
    });

    await request.save();

    await createAdminNotification(
      'Wallet Recharge Request',
      `${req.user.name} requested an offline top-up of ₹${amount}.`,
      'SYSTEM',
      '/admin/offline-topups'
    );

    res.status(201).json({ message: 'Top-up request submitted successfully', request });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all offline topup requests (Admin)
// @route   GET /api/wallet/offline-topup
// @access  Private (Admin)
export const getOfflineTopUps = async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.query;
    const filter: any = {};
    if (status) filter.status = status;
    
    const requests = await OfflineTopUpRequest.find(filter)
      .populate('agentId', 'name email agencyName agencyCode')
      .populate('processedBy', 'name')
      .sort({ createdAt: -1 })
      .lean();
      
    res.json(requests);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get logged in agent's offline topup requests
// @route   GET /api/wallet/offline-topup/my-requests
// @access  Private (B2B Agent)
export const getMyOfflineTopUps = async (req: AuthRequest, res: Response) => {
  try {
    const requests = await OfflineTopUpRequest.find({ agentId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
      
    res.json(requests);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Approve offline topup request
// @route   PUT /api/wallet/offline-topup/:id/approve
// @access  Private (Admin)
export const approveOfflineTopUp = async (req: AuthRequest, res: Response) => {
  try {
    const request = await OfflineTopUpRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.status !== 'PENDING') return res.status(400).json({ message: 'Request already processed' });

    const agent = await User.findById(request.agentId);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    // Update wallet
    agent.walletBalance += request.amount;
    await agent.save();

    // Create Transaction
    await Transaction.create({
      user: agent._id,
      amount: request.amount,
      type: 'CREDIT',
      description: `Manual Top-Up (${request.paymentMode}) Approved. Ref: ${request.referenceNumber || request.chequeNumber || 'N/A'}`,
      paymentMethod: request.paymentMode,
      surcharge: 0
    });

    // Update Request
    request.status = 'APPROVED';
    request.processedBy = req.user._id;
    request.processedAt = new Date();
    await request.save();

    try {
      await sendWalletTopupEmail(
        agent.email,
        agent.name || 'Agent',
        request.amount,
        agent.walletBalance,
        request.referenceNumber || request.chequeNumber || 'N/A'
      );
    } catch (e) {
      console.error('Failed to send topup email:', e);
    }

    res.json({ message: 'Request approved and wallet credited', request });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reject offline topup request
// @route   PUT /api/wallet/offline-topup/:id/reject
// @access  Private (Admin)
export const rejectOfflineTopUp = async (req: AuthRequest, res: Response) => {
  try {
    const request = await OfflineTopUpRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.status !== 'PENDING') return res.status(400).json({ message: 'Request already processed' });

    request.status = 'REJECTED';
    request.processedBy = req.user._id;
    request.processedAt = new Date();
    await request.save();

    res.json({ message: 'Request rejected', request });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// --- WITHDRAWAL REQUESTS ---

// @desc    Submit withdrawal request
// @route   POST /api/wallet/withdrawal-request
// @access  Private (B2B Agent)
export const submitWithdrawalRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { amount, bankDetails } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' });
    if (!bankDetails) return res.status(400).json({ message: 'Bank details required' });

    const agent = await User.findById(req.user._id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    if (agent.walletBalance < amount) return res.status(400).json({ message: 'Insufficient wallet balance' });

    // Deduct immediately to freeze funds
    agent.walletBalance -= amount;
    await agent.save();

    const request = new WithdrawalRequest({
      agentId: req.user._id,
      amount,
      bankDetails,
    });
    await request.save();

    await Transaction.create({
      user: agent._id,
      amount,
      type: 'DEBIT',
      description: `Withdrawal Request Submitted (Pending Approval)`,
      paymentMethod: 'BANK_TRANSFER'
    });

    await createAdminNotification(
      'Withdrawal Request',
      `${req.user.name} requested a withdrawal of ₹${amount}.`,
      'SYSTEM',
      '/admin/withdrawals'
    );

    res.status(201).json(request);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get logged in agent's withdrawal requests
// @route   GET /api/wallet/withdrawal-requests
// @access  Private (B2B Agent)
export const getMyWithdrawalRequests = async (req: AuthRequest, res: Response) => {
  try {
    const requests = await WithdrawalRequest.find({ agentId: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json(requests);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all withdrawal requests
// @route   GET /api/wallet/admin/withdrawals
// @access  Private (Admin)
export const getAllWithdrawalRequests = async (req: AuthRequest, res: Response) => {
  try {
    const query: any = req.query.status ? { status: req.query.status as string } : {};
    const requests = await WithdrawalRequest.find(query)
      .populate('agentId', 'name email agencyName')
      .sort({ createdAt: -1 })
      .lean();
    res.json(requests);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update withdrawal request status
// @route   PUT /api/wallet/admin/withdrawals/:id
// @access  Private (Admin)
export const updateWithdrawalRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { status, adminRemarks } = req.body; // 'APPROVED' or 'REJECTED'
    const request = await WithdrawalRequest.findById(req.params.id);
    
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.status !== 'PENDING') return res.status(400).json({ message: `Request already ${request.status}` });

    request.status = status;
    request.adminRemarks = adminRemarks;
    
    if (status === 'REJECTED') {
      // Refund the wallet
      const agent = await User.findById(request.agentId);
      if (agent) {
        agent.walletBalance += request.amount;
        await agent.save();
        
        await Transaction.create({
          user: agent._id,
          amount: request.amount,
          type: 'CREDIT',
          description: `Withdrawal Request Rejected (Refunded)`,
          paymentMethod: 'BANK_TRANSFER'
        });
      }
    } else if (status === 'APPROVED') {
      // Wallet was already deducted, just log the final approval transaction if desired
      // We can also just leave the original DEBIT transaction as it is, or update its description
    }
    
    await request.save();
    res.json(request);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Admin manually recharge an agent's wallet
// @route   POST /api/wallet/admin/recharge
// @access  Private (Admin)
export const adminRechargeWallet = async (req: AuthRequest, res: Response) => {
  try {
    const { agencyId, amount, paymentMode, processingFee, remarks } = req.body;

    if (!agencyId || !amount) {
      return res.status(400).json({ message: 'Agency ID and Amount are required' });
    }

    const targetUser = await User.findById(agencyId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Agency/User not found' });
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    const numericFee = Number(processingFee || 0);
    const totalCredit = numericAmount + numericFee;

    // Update user wallet balance
    targetUser.walletBalance = (targetUser.walletBalance || 0) + totalCredit;
    await targetUser.save();

    // Log transaction
    const transaction = new Transaction({
      user: targetUser._id,
      amount: totalCredit,
      type: 'CREDIT',
      description: `Wallet recharge via ${paymentMode || 'Admin'} - ${remarks || ''}`.trim(),
      balanceAfter: targetUser.walletBalance,
      referenceId: `ADM-RECHARGE-${Date.now()}`,
    });
    await transaction.save();

    res.json({
      message: 'Wallet recharged successfully',
      walletBalance: targetUser.walletBalance,
      transaction
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

