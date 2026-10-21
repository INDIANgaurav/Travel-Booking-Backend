import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import Booking from './booking.model';
import Refund from './refund.model';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { bookFlight } from '../flights/nexusdmc.service';
import { bookFlight as bookFlightGapi, getBookingDetails as getBookingDetailsGapi } from '../flights/gapi.service';
import SeriesFare from '../seriesFare/seriesFare.model';
import mongoose from 'mongoose';
import User from '../users/user.model';
import Transaction from '../wallet/wallet.model';
import { createAdminNotification } from '../notifications/notification.controller';
import { sendBookingConfirmationEmail, sendCancellationEmail } from '../../utils/email.service';
import { getIo } from '../../config/socket';
import { executeFlightSupplierBooking } from './flightBookingProcessor';

export const getMyBookings = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const bookings = await Booking.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const totalRecords = await Booking.countDocuments({ user: req.user._id });

    res.json({
      bookings,
      currentPage: page,
      totalPages: Math.ceil(totalRecords / limit),
      totalRecords
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createFlightBooking = async (req: AuthRequest, res: Response) => {
  let session;
  try {
    const { totalAmount, details, date, bookingMode = 'PERSONAL', paymentMethod = 'RAZORPAY', idempotencyKey, promoCode } = req.body;

    console.log("=========================================================");
    console.log("🚨 INCOMING FLIGHT BOOKING REQUEST (createFlightBooking)");
    console.log("Payment Method:", paymentMethod);
    console.log("Is GAPI Fare?:", details?.isGapiFare);
    console.log("Details Payload:", JSON.stringify(details, null, 2));
    console.log("=========================================================");

    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({ message: 'Invalid total amount' });
    }

    let finalPromoCode = null;
    let finalDiscountAmount = 0;

    if (promoCode) {
      const PromoCodeModel = require('../promos/promo.model').default;
      const promo = await PromoCodeModel.findOne({ code: promoCode.toUpperCase(), isActive: true });
      if (promo && (promo.maxUses === 0 || promo.usedCount < promo.maxUses)) {
        finalPromoCode = promo.code;
        finalDiscountAmount = promo.discountType === 'FLAT' ? promo.discountAmount : (totalAmount * (promo.discountAmount / 100));
        promo.usedCount += 1;
        await promo.save();
      }
    }

    if (paymentMethod === 'WALLET') {
      const mongoose = require('mongoose');
      session = await mongoose.startSession();
      session.startTransaction();

      // Check for Idempotency Key in session to prevent duplicate double-charges
      if (idempotencyKey) {
        const existingBooking = await Booking.findOne({ idempotencyKey }).session(session);
        if (existingBooking) {
          await session.abortTransaction();
          session.endSession();
          return res.status(409).json({ message: 'Duplicate booking request detected', booking: existingBooking });
        }
      }

      // Pre-Booking Supplier Validation
      const Supplier = require('../supplier/supplier.model').default;
      const supplierId = details?.supplierId;
      const flightCostToSupplier = details?.nexus_total_price || details?.baseFare || 0;
      let supplierDoc = null;

      if (supplierId && flightCostToSupplier > 0) {
        if (details?.isSeriesFare) {
          // Internal Agent-Supplier (Series Fare)
          // We owe them the Base Fare, so we CREDIT their wallet
          const AgentSupplier = require('../users/user.model').default;
          const WalletTransaction = require('../wallet/wallet.model').Transaction;
          const agentSupplierDoc = await AgentSupplier.findById(supplierId).session(session);
          
          if (agentSupplierDoc) {
            agentSupplierDoc.walletBalance += flightCostToSupplier;
            await agentSupplierDoc.save({ session });
            
            const isSelfConsumption = req.user._id.toString() === supplierId.toString();
            if (isSelfConsumption) details.isSelfConsumption = true;
            
            await WalletTransaction.create([{
              user: agentSupplierDoc._id,
              type: 'CREDIT',
              amount: flightCostToSupplier,
              description: isSelfConsumption ? `Self-Consumption Seat Block (User: ${req.user._id})` : `Series Fare Sale Credit (Booking by User: ${req.user._id})`,
              grossAmount: flightCostToSupplier,
              netAmountDebited: 0
            }], { session });
          }
        } else {
          // External API Supplier (e.g. Nexus DMC)
          // Admin pays them, so we DEDUCT from their prepaid balance
          supplierDoc = await Supplier.findById(supplierId).session(session);
          if (!supplierDoc) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Linked supplier account not found' });
          }
          if ((supplierDoc.balance + supplierDoc.creditLimit) < flightCostToSupplier) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'System error: Unable to fulfill booking at this time (Supplier Funds Insufficient).' });
          }
          // Deduct from supplier balance
          supplierDoc.balance -= flightCostToSupplier;
          await supplierDoc.save({ session });
          
          // Record supplier transaction
          const SupplierTransaction = require('../supplier/supplierTransaction.model').default;
          await SupplierTransaction.create([{
            supplierId: supplierDoc._id,
            type: 'DEDUCTION',
            amount: flightCostToSupplier,
            description: `Flight Booking Deduction (User: ${req.user._id}, Amt: ${flightCostToSupplier})`
          }], { session });
        }
      }

      const user = await User.findOneAndUpdate(
        { _id: req.user._id, walletBalance: { $gte: totalAmount } },
        { $inc: { walletBalance: -totalAmount } },
        { session, new: true }
      );

      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'Insufficient wallet balance' });
      }

      const newBooking = new Booking({
        user: req.user._id,
        bookingId: `BKG-FL-${Math.floor(Math.random() * 1000000)}`,
        type: 'FLIGHT',
        bookingMode,
        paymentMethod,
        status: 'TICKETING_IN_PROGRESS',
        totalAmount,
        promoCodeApplied: finalPromoCode,
        discountAmount: finalDiscountAmount,
        date,
        details,
        idempotencyKey
      });

      await newBooking.save({ session });

      await Transaction.create([{
        user: req.user._id,
        type: 'DEBIT',
        amount: totalAmount,
        description: `Flight Booking Debit: ${newBooking.bookingId}`,
        paymentMethod: 'WALLET',
        pnr: newBooking.bookingId
      }], { session });

      await session.commitTransaction();
      session.endSession();
      session = undefined; // clear session so we don't abort it in generic catch

      let apiBookingFailed = false;

      if (details) {
        const result = await executeFlightSupplierBooking(newBooking.bookingId, details, req.user._id);
        apiBookingFailed = result.apiBookingFailed;
        newBooking.details = result.details;
        if (!apiBookingFailed) {
          newBooking.status = result.status;
        }
      }

      if (apiBookingFailed) {
        newBooking.status = 'FAILED_REFUNDING';
        await newBooking.save();

        // Rollback Wallet Deduction via new transaction
        const refundSession = await mongoose.startSession();
        refundSession.startTransaction();
        try {
          // 1. Rollback User Wallet
          await User.findByIdAndUpdate(req.user._id, { $inc: { walletBalance: totalAmount } }, { session: refundSession });
          await Transaction.create([{
            user: req.user._id, 
            type: 'CREDIT', 
            amount: totalAmount,
            description: `Refund for failed Flight Booking: ${newBooking.bookingId}`, 
            paymentMethod: 'WALLET',
            pnr: newBooking.bookingId
          }], { session: refundSession });
          
          // 2. Rollback Supplier/Agent Wallet
          if (supplierId && flightCostToSupplier > 0) {
            if (details?.isSeriesFare) {
              const AgentSupplier = require('../users/user.model').default;
              const WalletTransaction = require('../wallet/wallet.model').Transaction;
              await AgentSupplier.findByIdAndUpdate(supplierId, { $inc: { walletBalance: -flightCostToSupplier } }, { session: refundSession });
              await WalletTransaction.create([{
                user: supplierId,
                type: 'DEBIT',
                amount: flightCostToSupplier,
                description: `Series Fare Sale Rollback (Booking Failed)`,
                grossAmount: flightCostToSupplier,
                netAmountDebited: flightCostToSupplier
              }], { session: refundSession });
            } else {
              const Supplier = require('../supplier/supplier.model').default;
              const SupplierTransaction = require('../supplier/supplierTransaction.model').default;
              await Supplier.findByIdAndUpdate(supplierId, { $inc: { balance: flightCostToSupplier } }, { session: refundSession });
              await SupplierTransaction.create([{
                supplierId,
                type: 'REFUND',
                amount: flightCostToSupplier,
                description: `Flight Booking Rollback (Failed API Call, Amt: ${flightCostToSupplier})`
              }], { session: refundSession });
            }
          }

          newBooking.status = 'FAILED';
          newBooking.cancellationReason = 'Flight Booking API Failed - Auto Refunded';
          newBooking.refundAmount = totalAmount;
          newBooking.refundStatus = 'COMPLETED';
          await newBooking.save({ session: refundSession });

          await refundSession.commitTransaction();
        } catch (refundError) {
          await refundSession.abortTransaction();
          console.error("Critical Refund Failure:", refundError);
        } finally {
          refundSession.endSession();
        }
        
        return res.status(200).json({ 
          booking: newBooking, 
          apiFailed: true,
          message: 'Payment successful but ticketing failed. Full refund has been initiated to Wallet.' 
        });
      }

      await newBooking.save();

      const io = getIo();
      if (io) {
        io.to('admin_dashboard').emit('activity', {
          message: `New Flight Booking created (ID: ${newBooking.bookingId}) - ₹${newBooking.totalAmount}`,
          type: 'BOOKING',
          timestamp: new Date()
        });
      }

      try {
        await sendBookingConfirmationEmail(
          req.user.email,
          req.user.name || 'Agent',
          newBooking
        );
      } catch (e) {
        console.error('Failed to send booking email:', e);
      }

      return res.status(201).json({
        booking: newBooking,
        message: 'Booking confirmed using wallet balance'
      });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    });

    const options = {
      amount: totalAmount * 100, 
      currency: "INR",
      receipt: `receipt_${Date.now()}`
    };
    
    const order = await razorpay.orders.create(options);

    const newBooking = new Booking({
      user: req.user._id,
      bookingId: `BKG-FL-${Math.floor(Math.random() * 1000000)}`,
      type: 'FLIGHT',
      bookingMode,
      status: 'PAYMENT_PENDING',
      totalAmount,
      promoCodeApplied: finalPromoCode,
      discountAmount: finalDiscountAmount,
      date,
      details,
      razorpayOrderId: order.id,
      idempotencyKey
    });

    await newBooking.save();

    const io = getIo();
    if (io) {
      io.to('admin_dashboard').emit('activity', {
        message: `New Flight Booking created (ID: ${newBooking.bookingId}) - ₹${newBooking.totalAmount}`,
        type: 'BOOKING',
        timestamp: new Date()
      });
    }

    res.status(201).json({
      booking: newBooking,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency
    });

  } catch (error: any) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    console.error('Error creating flight booking:', error);
    if (error.code === 11000 && error.keyPattern && error.keyPattern.idempotencyKey) {
       return res.status(409).json({ message: 'Duplicate booking request detected' });
    }
    res.status(500).json({ message: 'Failed to create flight booking and order' });
  }
};

export const createHotelBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { totalAmount, details, date, bookingMode = 'PERSONAL', paymentMethod = 'RAZORPAY' } = req.body;

    if (paymentMethod === 'WALLET') {
      const user = await User.findOneAndUpdate(
        { _id: req.user._id, walletBalance: { $gte: totalAmount } },
        { $inc: { walletBalance: -totalAmount } },
        { new: true }
      );

      if (!user) {
        return res.status(400).json({ message: 'Insufficient wallet balance' });
      }

      const newBooking = new Booking({
        user: req.user._id,
        bookingId: `HTL-${Math.floor(Math.random() * 1000000)}`,
        type: 'HOTEL',
        bookingMode,
        paymentMethod,
        status: 'TICKETING_IN_PROGRESS',
        totalAmount,
        date,
        details,
      });

      await newBooking.save();

      await Transaction.create({
        user: req.user._id,
        type: 'DEBIT',
        amount: totalAmount,
        description: `Hotel Booking Debit: ${newBooking.bookingId}`,
        paymentMethod: 'WALLET',
      });

      return res.status(201).json({
        booking: newBooking,
        message: 'Booking confirmed using wallet balance'
      });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    });

    const options = {
      amount: totalAmount * 100, // paise
      currency: "INR",
      receipt: `receipt_htl_${Date.now()}`
    };
    
    const order = await razorpay.orders.create(options);

    const newBooking = new Booking({
      user: req.user._id,
      bookingId: `HTL-${Math.floor(Math.random() * 1000000)}`,
      type: 'HOTEL',
      bookingMode,
      status: 'PAYMENT_PENDING',
      totalAmount,
      date,
      details,
      razorpayOrderId: order.id
    });

    await newBooking.save();

    res.status(201).json({
      booking: newBooking,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency
    });

  } catch (error: any) {
    console.error('Error creating hotel booking:', error);
    res.status(500).json({ message: 'Failed to create hotel booking and order' });
  }
};


export const verifyPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    
    // Create expected signature
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generated_signature = hmac.digest('hex');

    if (generated_signature === razorpay_signature) {
      // Payment is successful
      // Find the booking and update its status
      const booking = await Booking.findOne({ razorpayOrderId: razorpay_order_id });
      
      if (!booking) {
        return res.status(404).json({ message: 'Booking not found for this order' });
      }

      // If it's a flight, call NexusDMC Book API
      const details = booking.details as any;
      let apiBookingFailed = false;

      if (booking.type === 'FLIGHT' && details) {
        const result = await executeFlightSupplierBooking(booking.bookingId, details, req.user._id);
        apiBookingFailed = result.apiBookingFailed;
        booking.details = result.details;
        booking.markModified('details');
      }

      if (apiBookingFailed) {
        booking.status = 'CANCELLED';
        booking.cancellationReason = 'Flight Booking API Failed - Auto Refunded';
        booking.refundAmount = booking.totalAmount;
        
        try {
          const Razorpay = require('razorpay');
          const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID || '',
            key_secret: process.env.RAZORPAY_KEY_SECRET || ''
          });
          
          await razorpay.payments.refund(razorpay_payment_id, {
            amount: booking.totalAmount * 100, // in paise
            speed: 'normal'
          });
          booking.refundStatus = 'COMPLETED';
        } catch (refundError) {
          console.error("Auto refund failed after API error:", refundError);
          booking.refundStatus = 'FAILED';
          // Status stays CANCELLED, but refund failed manually need to check
        }
      } else {
        booking.status = 'CONFIRMED';
      }
      
      booking.razorpayPaymentId = razorpay_payment_id;
      booking.razorpaySignature = razorpay_signature;
      await booking.save();

      if (apiBookingFailed) {
        res.status(200).json({ message: 'Payment successful but ticketing failed. Full refund has been initiated.', booking, apiFailed: true });
      } else {
        try {
          await sendBookingConfirmationEmail(
            req.user.email,
            req.user.name || 'Agent',
            booking
          );
        } catch (e) {
          console.error('Failed to send booking email:', e);
        }
        res.status(200).json({ message: 'Payment verified successfully', booking });
      }
    } else {
      res.status(400).json({ message: 'Invalid payment signature' });
    }
  } catch (error: any) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ message: 'Payment verification failed' });
  }
};

export const getBookingById = async (req: AuthRequest, res: Response) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('user', 'name email phone');
    
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Allow if user is admin, sub_admin, supplier_agent OR if user owns the booking
    const allowedRoles = ['SUPER_ADMIN', 'SUB_ADMIN', 'SUPPLIER_AGENT', 'SUPPLIER_STAFF'];
    if (!req.user.roles.some((role: string) => allowedRoles.includes(role)) && booking.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to view this booking' });
    }

    res.json(booking);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getCancellationPreview = async (req: AuthRequest, res: Response) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id });
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (!['CONFIRMED', 'PAYMENT_PENDING', 'INITIATED', 'TICKETING_IN_PROGRESS'].includes(booking.status)) {
      return res.status(400).json({ message: 'Booking cannot be cancelled' });
    }

    const isHotel = booking.type === 'HOTEL';
    const travelDateStr = isHotel ? booking.details.checkIn : booking.date;
    const travelDate = new Date(travelDateStr || booking.createdAt);
    travelDate.setHours(23, 59, 59, 999); // Allow cancellation until end of the check-in/travel day
    const now = new Date();

    if (travelDate.getTime() < now.getTime()) {
      return res.status(400).json({ message: 'Cannot cancel past bookings' });
    }

    const hoursUntilTravel = (travelDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    const totalAmount = booking.totalAmount;

    let deductionPercentage = 0;
    let policy = "Free cancellation";

    if (hoursUntilTravel <= 24) {
      deductionPercentage = 50;
      policy = "50% deduction for cancellations within 24 hours of travel";
    } else if (hoursUntilTravel <= 72) {
      deductionPercentage = 20;
      policy = "20% deduction for cancellations within 72 hours of travel";
    }

    const deductionAmount = (totalAmount * deductionPercentage) / 100;
    const refundAmount = totalAmount - deductionAmount;

    res.json({
      originalAmount: totalAmount,
      deductionAmount,
      refundAmount,
      policy,
      hoursUntilTravel: Math.round(hoursUntilTravel)
    });

  } catch (error: any) {
    console.error('Cancellation preview error:', error);
    res.status(500).json({ message: 'Failed to calculate cancellation preview' });
  }
};

export const cancelBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id });
    
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (!['CONFIRMED', 'PAYMENT_PENDING', 'INITIATED', 'TICKETING_IN_PROGRESS'].includes(booking.status)) {
      return res.status(400).json({ message: 'Booking is already cancelled or cannot be cancelled' });
    }

    const isHotel = booking.type === 'HOTEL';
    const travelDateStr = isHotel ? booking.details.checkIn : booking.date;
    const travelDate = new Date(travelDateStr || booking.createdAt);
    travelDate.setHours(23, 59, 59, 999); // Allow cancellation until end of the check-in/travel day
    const now = new Date();

    const hoursUntilTravel = (travelDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    const totalAmount = booking.totalAmount;

    let deductionPercentage = 0;
    if (hoursUntilTravel <= 24) {
      deductionPercentage = 50;
    } else if (hoursUntilTravel <= 72) {
      deductionPercentage = 20;
    }

    const deductionAmount = (totalAmount * deductionPercentage) / 100;
    const refundAmount = totalAmount - deductionAmount;

    // Update Booking initially
    booking.status = 'CANCELLED';
    booking.cancellationReason = reason || 'User requested cancellation';
    booking.cancelledAt = now;
    booking.refundAmount = refundAmount;
    booking.refundStatus = 'PROCESSING';
    
    let razorpayRefundId: string | undefined;

    // Trigger Refund based on payment method
    if (booking.paymentMethod === 'WALLET' && refundAmount > 0) {
      // Refund to wallet
      const user = await User.findById(req.user._id);
      if (user) {
        user.walletBalance = (user.walletBalance || 0) + refundAmount;
        await user.save();
        
        // Create wallet transaction
        const transaction = new Transaction({
          user: user._id,
          type: 'CREDIT',
          amount: refundAmount,
          description: `Refund for cancelled booking ${booking.bookingId}`,
          paymentMethod: 'WALLET',
          referenceNo: booking.bookingId,
          pnr: booking.details?.pnr || '',
          productName: booking.type,
          netAmountDebited: refundAmount
        });
        await transaction.save();
        booking.refundStatus = 'COMPLETED';
      }
    } else if (booking.razorpayPaymentId && refundAmount > 0) {
      try {
        const razorpay = new Razorpay({
          key_id: process.env.RAZORPAY_KEY_ID || '',
          key_secret: process.env.RAZORPAY_KEY_SECRET || '',
        });

        const refundResponse = await razorpay.payments.refund(booking.razorpayPaymentId, {
          amount: Math.round(refundAmount * 100), // convert to paise
          speed: "optimum"
        });

        if (refundResponse && refundResponse.id) {
          booking.refundStatus = 'COMPLETED';
          razorpayRefundId = refundResponse.id;
        }
      } catch (refundError) {
        console.error('Razorpay refund failed:', refundError);
        booking.refundStatus = 'FAILED';
        
        await createAdminNotification(
          'Refund Failed',
          `Razorpay refund failed for booking ${booking.bookingId}. Manual intervention required.`,
          'REFUND_PENDING',
          '/admin/treasury/queue'
        );
      }
    } else if (refundAmount === 0) {
      booking.refundStatus = 'NONE';
    }

    await booking.save();

    // Send Cancellation Email
    try {
      const pnr = booking.details?.pnr || booking.bookingId;
      await sendCancellationEmail(
        req.user.email,
        req.user.name,
        pnr,
        refundAmount
      );
    } catch (emailError) {
      console.error('Failed to send cancellation email:', emailError);
    }

    await booking.save();

    await createAdminNotification(
      'Booking Cancelled',
      `Booking ${booking.bookingId} was cancelled by ${req.user.name}.`,
      'BOOKING_CANCELLED',
      '/admin/bookings'
    );

    // Create Refund Record
    const refund = new Refund({
      bookingId: booking._id,
      userId: req.user._id,
      originalAmount: totalAmount,
      deductionAmount,
      refundAmount,
      status: booking.refundStatus,
      reason: booking.cancellationReason,
      razorpayRefundId
    });

    await refund.save();

    res.json({
      message: 'Booking cancelled successfully',
      booking,
      refund
    });

  } catch (error: any) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ message: 'Failed to cancel booking' });
  }
};
