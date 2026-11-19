import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import Booking from './booking.model';
import Refund from './refund.model';
import CheckoutAttempt from './checkoutAttempt.model';
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
import { generateSecureBookingId } from '../../utils/bookingId.generator';

export const computePassengerFingerprint = (passengers: any[]): string => {
  if (!Array.isArray(passengers) || passengers.length === 0) return 'NO_PAX';
  const names = passengers
    .map(p => (p.name || `${p.firstName || ''} ${p.lastName || ''}`).trim().toLowerCase().replace(/\s+/g, ''))
    .sort();
  return crypto.createHash('sha256').update(names.join('|')).digest('hex').slice(0, 16);
};

export const computeFlightFingerprint = (details: any, date: any): string => {
  const flightNo = (details?.flightNo || '').trim().toUpperCase();
  const dateStr = date ? new Date(date).toISOString().slice(0, 10) : '';
  const from = (details?.from || '').trim().toUpperCase();
  const to = (details?.to || '').trim().toUpperCase();
  return `${flightNo}_${dateStr}_${from}_${to}`;
};

export const computeCheckoutFingerprint = (userId: string, flightFingerprint: string, passengerFingerprint: string): string => {
  return crypto.createHash('sha256').update(`${userId}:${flightFingerprint}:${passengerFingerprint}`).digest('hex');
};

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
  let effectiveIdempotencyKey: string | undefined;
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

    // Strict Server-Side Price Tampering Validation
    const numericAmount = Number(totalAmount);
    if (!numericAmount || isNaN(numericAmount) || numericAmount < 500) {
      return res.status(400).json({ message: 'Invalid or tampered flight booking amount (minimum ₹500 required).' });
    }

    if (details?.price && Number(details.price) > 0) {
      const quotedFare = Number(details.price);
      if (numericAmount < quotedFare * 0.5) {
        console.warn(`[SECURITY ALERT] Flight price tampering detected for user ${req.user._id}: quoted ₹${quotedFare}, submitted ₹${numericAmount}`);
        return res.status(400).json({ message: 'Fare mismatch detected. Price has changed or is invalid. Please search again.' });
      }
    }

    if (details?.isSeriesFare && (details.seriesFareId || details.series_id)) {
      try {
        const SeriesFare = require('../seriesFare/seriesFare.model').default;
        const sf = await SeriesFare.findById(details.seriesFareId || details.series_id);
        if (sf && sf.adtFare) {
          const paxCount = details.passengers?.length || 1;
          const expectedMin = (sf.adtFare * paxCount) * 0.7;
          if (numericAmount < expectedMin) {
            console.warn(`[SECURITY ALERT] Series Fare tampering attempt for user ${req.user._id}: expected min ₹${expectedMin}, submitted ₹${numericAmount}`);
            return res.status(400).json({ message: 'Series fare price verification failed. Please refresh flight results.' });
          }
        }
      } catch (sfErr) {
        console.warn('Series fare price check note:', sfErr);
      }
    }

    // 1. Compute Deterministic Passenger & Flight Fingerprints (Requirement 1, 2, 5)
    const passengerFingerprint = computePassengerFingerprint(details?.passengers);
    const flightFingerprint = computeFlightFingerprint(details, date);
    const checkoutFingerprint = computeCheckoutFingerprint(req.user._id.toString(), flightFingerprint, passengerFingerprint);

    effectiveIdempotencyKey = (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim().length > 0)
      ? idempotencyKey.trim()
      : `TC-AUTO-${req.user._id}-${checkoutFingerprint.slice(0, 8)}-${Date.now()}`;

    // Check for existing booking by Idempotency Key before doing any operations
    const existingByIdempotency = await Booking.findOne({ idempotencyKey: effectiveIdempotencyKey, user: req.user._id });
    if (existingByIdempotency) {
      console.log(`[IDEMPOTENCY MATCH] Returning existing booking ${existingByIdempotency.bookingId} for key ${effectiveIdempotencyKey}`);
      if (existingByIdempotency.paymentMethod === 'WALLET') {
        return res.status(200).json({
          booking: existingByIdempotency,
          message: 'Existing wallet booking returned'
        });
      }
      return res.status(200).json({
        booking: existingByIdempotency,
        orderId: existingByIdempotency.razorpayOrderId,
        amount: existingByIdempotency.totalAmount * 100,
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID,
        isReusedOrder: true,
        message: 'Existing payment order returned'
      });
    }

    // 2. Database-Level Atomic Active Attempt Protection (Requirements 1, 2, 6)
    // Find active checkout attempt for this exact user & passenger/flight combination
    const existingActiveAttempt = await CheckoutAttempt.findOne({
      user: req.user._id,
      checkoutFingerprint,
      status: { $in: ['INITIATED', 'ORDER_CREATED'] }
    });

    if (existingActiveAttempt) {
      const now = new Date();
      if (existingActiveAttempt.expiresAt < now) {
        // Expired! Reconcile previous Razorpay order before allowing a new order (Requirement 6)
        console.log(`[SESSION RECONCILIATION] Attempt ${existingActiveAttempt._id} expired. Reconciling order ${existingActiveAttempt.razorpayOrderId}...`);
        
        if (existingActiveAttempt.razorpayOrderId && paymentMethod === 'RAZORPAY') {
          try {
            const razorpay = new Razorpay({
              key_id: process.env.RAZORPAY_KEY_ID || '',
              key_secret: process.env.RAZORPAY_KEY_SECRET || ''
            });
            const payments: any = await razorpay.orders.fetchPayments(existingActiveAttempt.razorpayOrderId);
            const capturedPayment = payments.items?.find((p: any) => p.status === 'captured');
            const authorizedPayment = payments.items?.find((p: any) => p.status === 'authorized');

            if (capturedPayment) {
              console.warn(`[RECONCILIATION FOUND CAPTURED] Order ${existingActiveAttempt.razorpayOrderId} was captured! Recovering...`);
              existingActiveAttempt.status = 'CONFIRMED';
              existingActiveAttempt.razorpayPaymentId = capturedPayment.id;
              await existingActiveAttempt.save();
              
              const recoveredBooking = await Booking.findOne({ razorpayOrderId: existingActiveAttempt.razorpayOrderId });
              return res.status(200).json({
                booking: recoveredBooking,
                orderId: existingActiveAttempt.razorpayOrderId,
                amount: existingActiveAttempt.totalAmount * 100,
                currency: 'INR',
                message: 'A previous payment for this flight was already captured. Recovering booking.'
              });
            } else if (authorizedPayment) {
              return res.status(409).json({
                message: 'Your previous payment is currently authorized and awaiting confirmation. Please do not re-book.'
              });
            } else {
              existingActiveAttempt.status = 'EXPIRED';
              await existingActiveAttempt.save();
            }
          } catch (fetchErr) {
            console.error('Error reconciling expired attempt with gateway:', fetchErr);
            return res.status(503).json({
              message: 'Verifying previous payment session with the payment gateway. Please retry in 1 minute.'
            });
          }
        } else {
          existingActiveAttempt.status = 'EXPIRED';
          await existingActiveAttempt.save();
        }
      } else {
        // Active attempt is within 15 minutes!
        // If winner thread is still INITIATED (order creation in-flight), poll/wait up to 3s for razorpayOrderId
        let activeOrderId = existingActiveAttempt.razorpayOrderId;
        if (!activeOrderId && existingActiveAttempt.status === 'INITIATED') {
          for (let poll = 0; poll < 6; poll++) {
            await new Promise(r => setTimeout(r, 500));
            const refreshed = await CheckoutAttempt.findById(existingActiveAttempt._id);
            if (refreshed && refreshed.razorpayOrderId) {
              activeOrderId = refreshed.razorpayOrderId;
              break;
            }
          }
        }
        console.log(`[ACTIVE ATTEMPT ATOMIC REUSE] Reusing order ${activeOrderId} for key ${effectiveIdempotencyKey}`);
        const existingBooking = await Booking.findOne({ razorpayOrderId: activeOrderId });
        return res.status(200).json({
          booking: existingBooking,
          orderId: activeOrderId,
          amount: existingActiveAttempt.totalAmount * 100,
          currency: 'INR',
          isReusedOrder: true,
          message: 'Reusing active checkout session for this flight'
        });
      }
    }

    // 3. Atomically Claim the Active Slot using the Partial Unique Index
    let checkoutAttemptDoc: any;
    const fifteenMinutesFromNow = new Date(Date.now() + 15 * 60 * 1000);
    try {
      checkoutAttemptDoc = await CheckoutAttempt.create({
        user: req.user._id,
        checkoutFingerprint,
        passengerFingerprint,
        flightFingerprint,
        idempotencyKey: effectiveIdempotencyKey,
        totalAmount,
        paymentMethod,
        status: 'INITIATED',
        expiresAt: fifteenMinutesFromNow
      });
    } catch (atomicErr: any) {
      if (atomicErr.code === 11000) {
        console.log(`[ATOMIC CONCURRENCY LOCK] Simultaneous request blocked by partial unique index! Waiting for winner order...`);
        // Poll for winner thread's razorpayOrderId (up to 3 seconds)
        for (let attempt = 0; attempt < 6; attempt++) {
          await new Promise(r => setTimeout(r, 500));
          const winnerAttempt = await CheckoutAttempt.findOne({
            user: req.user._id,
            checkoutFingerprint,
            status: { $in: ['INITIATED', 'ORDER_CREATED'] }
          });
          if (winnerAttempt && winnerAttempt.razorpayOrderId) {
            const winnerBooking = await Booking.findOne({ razorpayOrderId: winnerAttempt.razorpayOrderId });
            return res.status(200).json({
              booking: winnerBooking,
              orderId: winnerAttempt.razorpayOrderId,
              amount: winnerAttempt.totalAmount * 100,
              currency: 'INR',
              isReusedOrder: true
            });
          }
        }
      }
      throw atomicErr;
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
      if (effectiveIdempotencyKey) {
        const existingBooking = await Booking.findOne({ idempotencyKey: effectiveIdempotencyKey }).session(session);
        if (existingBooking) {
          await session.abortTransaction();
          session.endSession();
          return res.status(200).json({ message: 'Duplicate booking request detected; returning existing booking', booking: existingBooking });
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

      const bookingId = await generateSecureBookingId('FL');
      const newBooking = new Booking({
        user: req.user._id,
        bookingId,
        type: 'FLIGHT',
        bookingMode,
        paymentMethod,
        status: 'TICKETING_IN_PROGRESS',
        totalAmount,
        promoCodeApplied: finalPromoCode,
        discountAmount: finalDiscountAmount,
        date,
        details,
        idempotencyKey: effectiveIdempotencyKey,
        checkoutFingerprint,
        passengerFingerprint,
        flightFingerprint
      });

      await newBooking.save({ session });
      if (checkoutAttemptDoc) {
        checkoutAttemptDoc.status = 'CONFIRMED';
        checkoutAttemptDoc.bookingId = newBooking.bookingId;
        await checkoutAttemptDoc.save({ session });
      }

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
      let isUncertainTimeout = false;

      if (details) {
        const result = await executeFlightSupplierBooking(newBooking.bookingId, details, req.user._id);
        apiBookingFailed = result.apiBookingFailed;
        isUncertainTimeout = !!result.isUncertainTimeout;
        newBooking.details = result.details;
        if (!apiBookingFailed && !isUncertainTimeout) {
          newBooking.status = result.status as any;
        } else if (isUncertainTimeout) {
          newBooking.status = 'TICKETING_IN_PROGRESS';
        }
      }

      if (isUncertainTimeout) {
        // DO NOT REFUND OR ROLLBACK! Keep as TICKETING_IN_PROGRESS
        await newBooking.save();
        return res.status(200).json({
          booking: newBooking,
          isPendingReconciliation: true,
          message: 'Booking initiated. Ticket issuance is taking longer than expected with the airline supplier. Your booking will be automatically verified shortly.'
        });
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

      // Send confirmation email asynchronously without blocking booking response
      setImmediate(async () => {
        try {
          await sendBookingConfirmationEmail(
            req.user.email,
            req.user.name || 'Agent',
            newBooking
          );
        } catch (e) {
          console.error('Failed to send booking email:', e);
        }
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
      amount: totalAmount * 100, 
      currency: "INR",
      receipt: `receipt_${Date.now()}`
    };
    
    const order = await razorpay.orders.create(options);

    if (checkoutAttemptDoc) {
      checkoutAttemptDoc.razorpayOrderId = order.id;
      checkoutAttemptDoc.status = 'ORDER_CREATED';
      await checkoutAttemptDoc.save();
    }

    const bookingId = await generateSecureBookingId('FL');
    const newBooking = new Booking({
      user: req.user._id,
      bookingId,
      type: 'FLIGHT',
      bookingMode,
      status: 'PAYMENT_PENDING',
      totalAmount,
      promoCodeApplied: finalPromoCode,
      discountAmount: finalDiscountAmount,
      date,
      details,
      razorpayOrderId: order.id,
      idempotencyKey: effectiveIdempotencyKey,
      checkoutFingerprint,
      passengerFingerprint,
      flightFingerprint
    });

    try {
      await newBooking.save();
    } catch (saveErr: any) {
      if (saveErr.code === 11000) {
        // Race condition: another concurrent thread saved with the same idempotency key
        const raceBooking = await Booking.findOne({ idempotencyKey: effectiveIdempotencyKey, user: req.user._id });
        if (raceBooking) {
          return res.status(200).json({
            booking: raceBooking,
            orderId: raceBooking.razorpayOrderId || order.id,
            amount: raceBooking.totalAmount * 100,
            currency: 'INR',
            isReusedOrder: true
          });
        }
      }
      throw saveErr;
    }

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
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });

  } catch (error: any) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch (_) {}
      session.endSession();
    }
    console.error('Error creating flight booking:', error);

    // If concurrent wallet conflict or race occurred, check if twin request succeeded
    if (effectiveIdempotencyKey) {
      const raceBooking = await Booking.findOne({ idempotencyKey: effectiveIdempotencyKey, user: req.user._id });
      if (raceBooking) {
        return res.status(200).json({
          booking: raceBooking,
          orderId: raceBooking.razorpayOrderId,
          amount: raceBooking.totalAmount * 100,
          currency: 'INR',
          isReusedOrder: true,
          message: 'Booking request already processed'
        });
      }
    }

    if (error.code === 11000 && error.keyPattern && error.keyPattern.idempotencyKey) {
       return res.status(409).json({ message: 'Duplicate booking request detected' });
    }
    res.status(500).json({ message: 'Failed to create flight booking and order' });
  }
};

export const createHotelBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { totalAmount, details, date, bookingMode = 'PERSONAL', paymentMethod = 'RAZORPAY', idempotencyKey } = req.body;

    // Strict Server-Side Hotel Price Tampering Validation
    const numericAmount = Number(totalAmount);
    if (!numericAmount || isNaN(numericAmount) || numericAmount < 200) {
      return res.status(400).json({ message: 'Invalid or tampered hotel booking amount.' });
    }

    if (details?.hotelId) {
      try {
        const Hotel = require('../hotels/hotel.model').default;
        const hotelDoc = await Hotel.findById(details.hotelId);
        if (hotelDoc && hotelDoc.price) {
          const nights = Number(details.nights) || 1;
          const rooms = Number(details.rooms) || 1;
          const expectedMin = (hotelDoc.price * nights * rooms) * 0.5;
          if (numericAmount < expectedMin) {
            console.warn(`[SECURITY ALERT] Hotel price tampering detected for user ${req.user._id}: expected min ₹${expectedMin}, submitted ₹${numericAmount}`);
            return res.status(400).json({ message: 'Hotel price verification failed. Please select room and book again.' });
          }
        }
      } catch (hErr) {
        console.warn('Hotel price check note:', hErr);
      }
    }

    const effectiveIdempotencyKey = (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim().length > 0)
      ? idempotencyKey.trim()
      : `TC-AUTO-HTL-${req.user._id}-${details?.hotelId || 'HTL'}-${date ? new Date(date).toISOString().slice(0, 10) : Date.now()}`;

    // Backend Idempotency Check for Hotel
    const existingByIdempotency = await Booking.findOne({ idempotencyKey: effectiveIdempotencyKey, user: req.user._id });
    if (existingByIdempotency) {
      if (existingByIdempotency.paymentMethod === 'WALLET') {
        return res.status(200).json({
          booking: existingByIdempotency,
          message: 'Existing wallet booking returned'
        });
      }
      return res.status(200).json({
        booking: existingByIdempotency,
        orderId: existingByIdempotency.razorpayOrderId,
        amount: existingByIdempotency.totalAmount * 100,
        currency: 'INR',
        isReusedOrder: true
      });
    }

    if (paymentMethod === 'WALLET') {
      const mongoose = require('mongoose');
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // Idempotency check inside session
        if (idempotencyKey) {
          const existingBooking = await Booking.findOne({ idempotencyKey }).session(session);
          if (existingBooking) {
            await session.abortTransaction();
            session.endSession();
            return res.status(409).json({ message: 'Duplicate hotel booking request', booking: existingBooking });
          }
        }

        // Atomic User Balance deduction
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

        const bookingId = await generateSecureBookingId('HTL');
        const newBooking = new Booking({
          user: req.user._id,
          bookingId,
          type: 'HOTEL',
          bookingMode,
          paymentMethod: 'WALLET',
          status: 'CONFIRMED',
          totalAmount,
          date,
          details,
          idempotencyKey
        });

        await newBooking.save({ session });

        await Transaction.create([{
          user: req.user._id,
          type: 'DEBIT',
          amount: totalAmount,
          description: `Hotel Booking Debit: ${newBooking.bookingId}`,
          paymentMethod: 'WALLET',
          referenceNo: newBooking.bookingId
        }], { session });

        await session.commitTransaction();
        session.endSession();

        return res.status(201).json({
          booking: newBooking,
          message: 'Hotel booking confirmed using wallet balance'
        });
      } catch (walletErr) {
        await session.abortTransaction();
        session.endSession();
        throw walletErr;
      }
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

    const bookingId = await generateSecureBookingId('HTL');
    const newBooking = new Booking({
      user: req.user._id,
      bookingId,
      type: 'HOTEL',
      bookingMode,
      status: 'PAYMENT_PENDING',
      totalAmount,
      date,
      details,
      razorpayOrderId: order.id,
      idempotencyKey: effectiveIdempotencyKey
    });

    try {
      await newBooking.save();
    } catch (saveErr: any) {
      if (saveErr.code === 11000) {
        // Race condition: another concurrent thread saved with the same idempotency key
        const raceBooking = await Booking.findOne({ idempotencyKey: effectiveIdempotencyKey, user: req.user._id });
        if (raceBooking) {
          return res.status(200).json({
            booking: raceBooking,
            orderId: raceBooking.razorpayOrderId || order.id,
            amount: raceBooking.totalAmount * 100,
            currency: 'INR',
            isReusedOrder: true
          });
        }
      }
      throw saveErr;
    }

    res.status(201).json({
      booking: newBooking,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });

  } catch (error: any) {
    console.error('Error creating hotel booking:', error);
    res.status(500).json({ message: 'Failed to create hotel booking and order' });
  }
};


export const verifyPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: 'Missing payment credentials' });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    
    // Create expected signature
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generated_signature = hmac.digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ message: 'Invalid payment signature' });
    }

    // 1. Database-Level Atomic State Reservation
    // Only one execution (user callback OR webhook) can transition PAYMENT_PENDING -> TICKETING_IN_PROGRESS
    const booking = await Booking.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id, status: 'PAYMENT_PENDING' },
      {
        $set: {
          status: 'TICKETING_IN_PROGRESS',
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature
        }
      },
      { new: true }
    );
    
    if (!booking) {
      const existing = await Booking.findOne({ razorpayOrderId: razorpay_order_id });
      if (existing) {
        if (existing.status === 'CONFIRMED') {
          return res.status(200).json({ 
            message: 'Payment already verified and booking confirmed', 
            booking: existing,
            alreadyProcessed: true 
          });
        }
        if (existing.status === 'TICKETING_IN_PROGRESS') {
          return res.status(200).json({ 
            message: 'Payment received. Ticket issuance is in progress.', 
            booking: existing,
            inProgress: true 
          });
        }
        return res.status(200).json({
          message: `Booking is currently in ${existing.status} status`,
          booking: existing
        });
      }
      return res.status(404).json({ message: 'Booking not found for this order' });
    }

    // 2. Gateway Verification
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET || ''
    });

    try {
      const payment: any = await razorpay.payments.fetch(razorpay_payment_id);
      if (payment.order_id !== razorpay_order_id) {
        // Rollback status so it doesn't get stuck
        await Booking.updateOne({ _id: booking._id }, { $set: { status: 'PAYMENT_PENDING' } });
        return res.status(400).json({ message: 'Payment ID does not match specified Order ID' });
      }
      if (payment.status !== 'captured' && payment.status !== 'authorized') {
        await Booking.updateOne({ _id: booking._id }, { $set: { status: 'PAYMENT_PENDING' } });
        return res.status(400).json({ message: `Payment is not in an authorized state: ${payment.status}` });
      }
    } catch (payFetchErr: any) {
      console.error('Error fetching payment from gateway:', payFetchErr);
      // Revert so user or reconciliation can re-attempt
      await Booking.updateOne({ _id: booking._id }, { $set: { status: 'PAYMENT_PENDING' } });
      return res.status(502).json({ message: 'Unable to verify payment with gateway' });
    }

    // 3. Logical Checkout Atomic Ticketing Claim & Duplicate Protection (Requirements 4, 5, 7, 9)
    let acquiredTicketingClaim = true;
    if (booking.checkoutFingerprint) {
      const claim = await CheckoutAttempt.findOneAndUpdate(
        {
          checkoutFingerprint: booking.checkoutFingerprint,
          ticketingStatus: 'UNCLAIMED'
        },
        {
          $set: {
            ticketingStatus: 'CLAIMED',
            claimedByBookingId: booking.bookingId,
            claimedAt: new Date()
          }
        },
        { new: true }
      );

      if (!claim) {
        acquiredTicketingClaim = false;
        console.warn(`[DUPLICATE CAPTURE ATOMIC REJECTION] Ticketing already claimed for checkout ${booking.checkoutFingerprint}! Halting twin execution.`);
      }
    }

    // Precise duplicate check using passenger fingerprint (Requirement 5: prevents false positives for separate legitimate passengers)
    let duplicateConfirmed = null;
    if (booking.flightFingerprint && booking.passengerFingerprint) {
      duplicateConfirmed = await Booking.findOne({
        user: booking.user,
        _id: { $ne: booking._id },
        status: 'CONFIRMED',
        flightFingerprint: booking.flightFingerprint,
        passengerFingerprint: booking.passengerFingerprint
      });
    }

    if (!acquiredTicketingClaim || duplicateConfirmed) {
      console.warn(`[DUPLICATE PAYMENT DETECTED] Booking ${booking.bookingId} is duplicate. Cancelling and initiating auto-refund.`);
      booking.status = 'CANCELLED';
      booking.cancellationReason = 'Duplicate payment detected for this flight and passenger. Full refund initiated.';
      booking.refundAmount = booking.totalAmount;
      booking.refundStatus = 'PROCESSING'; // Requirement 4: Authoritatively PROCESSING until verified
      booking.razorpayPaymentId = razorpay_payment_id;
      booking.razorpaySignature = razorpay_signature;

      try {
        const refundResult: any = await razorpay.payments.refund(razorpay_payment_id, {
          amount: booking.totalAmount * 100,
          notes: {
            reason: 'Duplicate payment auto-refund',
            bookingId: booking.bookingId
          }
        });
        booking.refundId = refundResult?.id;
        if (refundResult?.status === 'processed') {
          booking.refundStatus = 'COMPLETED';
        }
      } catch (rfErr: any) {
        console.error('[GATEWAY REFUND ERROR]', rfErr);
        booking.refundStatus = 'FAILED';
      }

      await booking.save();

      // Record financial ledger entry (Requirement 9)
      await Transaction.create([{
        user: booking.user,
        type: 'CREDIT',
        amount: booking.totalAmount,
        description: `Auto-refund for duplicate booking payment (${booking.bookingId})`,
        paymentMethod: 'RAZORPAY',
        razorpayPaymentId: razorpay_payment_id,
        pnr: booking.bookingId
      }]);

      await Refund.create([{
        bookingId: booking._id,
        userId: booking.user,
        originalAmount: booking.totalAmount,
        deductionAmount: 0,
        refundAmount: booking.totalAmount,
        status: booking.refundStatus === 'COMPLETED' ? 'COMPLETED' : 'PROCESSING',
        reason: 'Duplicate payment auto-refund',
        razorpayRefundId: booking.refundId
      }]);

      return res.status(200).json({
        message: 'Duplicate payment detected. A ticket is already being issued or confirmed for this passenger. Your duplicate payment has been automatically refunded.',
        booking,
        isDuplicateRefunded: true
      });
    }

    // 4. Supplier Execution
    const details = booking.details as any;
    let apiBookingFailed = false;
    let isUncertainTimeout = false;

    if (booking.type === 'FLIGHT' && details) {
      const result = await executeFlightSupplierBooking(booking.bookingId, details, req.user._id);
      apiBookingFailed = result.apiBookingFailed;
      isUncertainTimeout = !!result.isUncertainTimeout;
      booking.details = result.details;
      booking.markModified('details');
    }

    booking.razorpayPaymentId = razorpay_payment_id;
    booking.razorpaySignature = razorpay_signature;

    if (isUncertainTimeout) {
      // UNCERTAIN OUTCOME: A timeout does not mean failure! DO NOT REFUND!
      booking.status = 'TICKETING_IN_PROGRESS';
      await booking.save();
      return res.status(200).json({
        message: 'Payment received. Ticket issuance is taking longer than expected with the airline supplier. Your booking will be automatically verified shortly.',
        booking,
        isPendingReconciliation: true
      });
    }

    if (apiBookingFailed) {
      booking.status = 'CANCELLED';
      booking.cancellationReason = 'Flight Booking API Failed - Auto Refunded';
      booking.refundAmount = booking.totalAmount;
      booking.refundStatus = 'PROCESSING';
      
      try {
        const refundResult: any = await razorpay.payments.refund(razorpay_payment_id, {
          amount: booking.totalAmount * 100, // in paise
          speed: 'normal'
        });
        booking.refundId = refundResult?.id;
        if (refundResult?.status === 'processed') {
          booking.refundStatus = 'COMPLETED';
        }
      } catch (refundError) {
        console.error("Auto refund failed after API error:", refundError);
        booking.refundStatus = 'FAILED';
      }
      await booking.save();

      if (booking.checkoutFingerprint) {
        await CheckoutAttempt.updateOne(
          { checkoutFingerprint: booking.checkoutFingerprint },
          { $set: { status: 'CANCELLED', ticketingStatus: 'CANCELLED' } }
        );
      }

      // Record financial ledger entry (Requirement 9)
      await Transaction.create([{
        user: booking.user,
        type: 'CREDIT',
        amount: booking.totalAmount,
        description: `Refund for failed Flight Booking: ${booking.bookingId}`,
        paymentMethod: 'RAZORPAY',
        razorpayPaymentId: razorpay_payment_id,
        pnr: booking.bookingId
      }]);

      await Refund.create([{
        bookingId: booking._id,
        userId: booking.user,
        originalAmount: booking.totalAmount,
        deductionAmount: 0,
        refundAmount: booking.totalAmount,
        status: booking.refundStatus === 'COMPLETED' ? 'COMPLETED' : 'PROCESSING',
        reason: 'Flight Booking API Failed - Auto Refunded',
        razorpayRefundId: booking.refundId
      }]);

      return res.status(200).json({ message: 'Payment successful but ticketing failed. Full refund has been initiated.', booking, apiFailed: true });
    } else {
      booking.status = 'CONFIRMED';
      await booking.save();

      if (booking.checkoutFingerprint) {
        await CheckoutAttempt.updateOne(
          { checkoutFingerprint: booking.checkoutFingerprint },
          { $set: { status: 'CONFIRMED', ticketingStatus: 'CONFIRMED' } }
        );
      }

      // Send confirmation email asynchronously without blocking verification response
      setImmediate(async () => {
        try {
          await sendBookingConfirmationEmail(
            req.user.email,
            req.user.name || 'Agent',
            booking
          );
        } catch (e) {
          console.error('Failed to send booking email:', e);
        }
      });
      return res.status(200).json({ message: 'Payment verified successfully and booking confirmed', booking });
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

    const bDetails = (booking.details || {}) as any;
    const isHotel = booking.type === 'HOTEL';
    const isSeriesFare = !isHotel && Boolean(
      bDetails.isSeriesFare ||
      bDetails.isAirIqFare ||
      bDetails.airIq_booking_id ||
      bDetails.supplierName === 'Air Iq' ||
      bDetails.refundable === false ||
      bDetails.refundable === 'Non Refundable'
    );

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
    let policy = "Standard cancellation";

    if (isSeriesFare) {
      // Series Fare / Fixed Departure tickets are 100% Non-Refundable
      deductionPercentage = 100;
      policy = "Series Fare / Fixed Departure flights are 100% Non-Refundable per airline allotment rules.";
    } else if (isHotel) {
      if (hoursUntilTravel <= 24) {
        deductionPercentage = 50;
        policy = "50% deduction for hotel cancellations within 24 hours of check-in";
      } else if (hoursUntilTravel <= 72) {
        deductionPercentage = 20;
        policy = "20% deduction for hotel cancellations within 72 hours of check-in";
      } else {
        deductionPercentage = 0;
        policy = "Free cancellation up to 72 hours before check-in";
      }
    } else {
      // Standard published flights
      const paxCount = booking.details?.passengers?.length || 1;
      const airlineCancellationFeePerPax = 3500;
      const totalAirlineFee = Math.min(totalAmount, airlineCancellationFeePerPax * paxCount);
      
      if (hoursUntilTravel <= 4) {
        deductionPercentage = 100;
        policy = "No-Show: Cancellations within 4 hours of flight departure are non-refundable.";
      } else if (hoursUntilTravel <= 24) {
        deductionPercentage = 75;
        policy = "75% deduction for flight cancellations within 24 hours of departure.";
      } else {
        deductionPercentage = Math.min(100, Math.round((totalAirlineFee / totalAmount) * 100));
        policy = `Airline cancellation charge of ₹${airlineCancellationFeePerPax.toLocaleString('en-IN')}/passenger applies.`;
      }
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
    const now = new Date();

    // Atomic Database-Level State Lock (Defeats Concurrent Double-Refund Exploit)
    const cancellableStatuses = ['CONFIRMED', 'PAYMENT_PENDING', 'INITIATED', 'TICKETING_IN_PROGRESS'];
    const booking: any = await Booking.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user._id,
        status: { $in: cancellableStatuses }
      } as any,
      {
        $set: {
          status: 'CANCELLATION_IN_PROGRESS',
          cancellationReason: reason || 'User requested cancellation',
          cancelledAt: now,
          refundStatus: 'PROCESSING'
        }
      },
      { new: true }
    );
    
    if (!booking) {
      const existing = await Booking.findOne({ _id: req.params.id, user: req.user._id });
      if (!existing) {
        return res.status(404).json({ message: 'Booking not found' });
      }
      return res.status(400).json({ 
        message: existing.status === 'CANCELLED' 
          ? 'Booking is already cancelled' 
          : 'Booking cannot be cancelled or cancellation is currently being processed.' 
      });
    }

    const bDetails = (booking.details || {}) as any;
    const isHotel = booking.type === 'HOTEL';
    const isSeriesFare = !isHotel && Boolean(
      bDetails.isSeriesFare ||
      bDetails.isAirIqFare ||
      bDetails.airIq_booking_id ||
      bDetails.supplierName === 'Air Iq' ||
      bDetails.refundable === false ||
      bDetails.refundable === 'Non Refundable'
    );

    const travelDateStr = isHotel ? booking.details.checkIn : booking.date;
    const travelDate = new Date(travelDateStr || booking.createdAt);
    travelDate.setHours(23, 59, 59, 999); // Allow cancellation until end of the check-in/travel day

    const hoursUntilTravel = (travelDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    const totalAmount = booking.totalAmount;

    let deductionPercentage = 0;
    if (isSeriesFare) {
      deductionPercentage = 100;
    } else if (isHotel) {
      if (hoursUntilTravel <= 24) {
        deductionPercentage = 50;
      } else if (hoursUntilTravel <= 72) {
        deductionPercentage = 20;
      } else {
        deductionPercentage = 0;
      }
    } else {
      const paxCount = booking.details?.passengers?.length || 1;
      const airlineCancellationFeePerPax = 3500;
      const totalAirlineFee = Math.min(totalAmount, airlineCancellationFeePerPax * paxCount);
      
      if (hoursUntilTravel <= 4) {
        deductionPercentage = 100;
      } else if (hoursUntilTravel <= 24) {
        deductionPercentage = 75;
      } else {
        deductionPercentage = Math.min(100, Math.round((totalAirlineFee / totalAmount) * 100));
      }
    }

    const deductionAmount = (totalAmount * deductionPercentage) / 100;
    const refundAmount = totalAmount - deductionAmount;

    // Update refund amounts on locked booking
    booking.refundAmount = refundAmount;
    
    let razorpayRefundId: string | undefined;

    // Trigger Refund based on payment method
    if (booking.paymentMethod === 'WALLET' && refundAmount > 0) {
      // Atomic wallet increment
      const user = await User.findByIdAndUpdate(
        req.user._id,
        { $inc: { walletBalance: refundAmount } },
        { new: true }
      );
      if (user) {
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
          grossAmount: refundAmount,
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

    booking.status = 'CANCELLED';
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
