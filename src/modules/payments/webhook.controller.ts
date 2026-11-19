import { Request, Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import WebhookLog from './webhook.model';
import Booking from '../bookings/booking.model';
import Refund from '../bookings/refund.model';
import CheckoutAttempt from '../bookings/checkoutAttempt.model';
import User from '../users/user.model';
import Transaction from '../wallet/wallet.model';
import TopUpOrder from '../wallet/topUpOrder.model';
import { executeFlightSupplierBooking } from '../bookings/flightBookingProcessor';
import { sendBookingConfirmationEmail } from '../../utils/email.service';

/**
 * Razorpay Webhook Handler (Stage 2 Hardened)
 * - Timing-safe cryptographic signature comparison
 * - Database-level atomic transition guarantees zero double-crediting
 * - Persisted TopUpOrder validation
 * - Handles payment.captured, order.paid, and refund.processed idempotently
 */
export const handleRazorpayWebhook = async (req: Request, res: Response) => {
  const signature = req.headers['x-razorpay-signature'] as string;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || '';

  if (!signature || !webhookSecret) {
    console.warn('[WEBHOOK ERROR] Missing webhook signature or webhook secret configuration');
    return res.status(400).json({ message: 'Missing signature or webhook secret' });
  }

  // 1. Verify Raw Signature with Timing-Safe comparison
  const rawBody = (req as any).rawBody;
  if (!rawBody) {
    console.error('[WEBHOOK ERROR] Raw request body not available for signature verification');
    return res.status(500).json({ message: 'Internal server configuration error: missing raw body' });
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const isSignatureValid =
    expectedSignature.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expectedSignature, 'utf8'), Buffer.from(signature, 'utf8'));

  if (!isSignatureValid) {
    console.warn('[WEBHOOK SECURITY] Invalid webhook signature detected');
    return res.status(400).json({ message: 'Invalid webhook signature' });
  }

  const eventPayload = req.body;
  const eventId = eventPayload?.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const eventType = eventPayload?.event;

  // 2. Database-level Event Idempotency with Crash Recovery
  let webhookLog = await WebhookLog.findOne({ eventId });
  if (webhookLog) {
    if (webhookLog.status === 'PROCESSED') {
      return res.status(200).json({ message: 'Event already processed' });
    }
    // If it was PROCESSING but stalled for > 5 minutes (e.g. server crashed mid-execution), allow retry
    if (webhookLog.status === 'PROCESSING') {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (webhookLog.updatedAt && webhookLog.updatedAt > fiveMinutesAgo) {
        return res.status(200).json({ message: 'Event is currently being processed by another worker' });
      }
      console.warn(`[WEBHOOK RECOVERY] Retrying stale PROCESSING webhook event: ${eventId}`);
      webhookLog.status = 'PROCESSING';
      webhookLog.processedAt = new Date();
      await webhookLog.save();
    }
  } else {
    try {
      webhookLog = await WebhookLog.create({
        eventId,
        eventType: eventType || 'unknown',
        payload: eventPayload,
        status: 'PROCESSING'
      });
    } catch (dupErr: any) {
      if (dupErr.code === 11000) {
        return res.status(200).json({ message: 'Event already claimed by concurrent worker' });
      }
      throw dupErr;
    }
  }

  try {
    const paymentEntity = eventPayload?.payload?.payment?.entity;
    const orderEntity = eventPayload?.payload?.order?.entity;

    const paymentId = paymentEntity?.id;
    const orderId = paymentEntity?.order_id || orderEntity?.id;

    if (eventType === 'order.paid' || eventType === 'payment.captured') {
      const notes = orderEntity?.notes || paymentEntity?.notes || {};
      const receipt = orderEntity?.receipt || paymentEntity?.receipt || '';

      // ==========================================
      // CASE A: Wallet Top-Up Event (Hardened)
      // ==========================================
      if (notes.purpose === 'WALLET_TOPUP' || receipt.startsWith('w_') || (orderId && await TopUpOrder.exists({ orderId }))) {
        if (orderId && paymentId) {
          // Atomic Database-Level Reservation: only 1 thread (client OR webhook) can transition CREATED -> CREDITED
          const topUpOrder = await TopUpOrder.findOneAndUpdate(
            { orderId, status: 'CREATED' },
            { $set: { status: 'CREDITED', paymentId } },
            { new: true }
          );

          if (topUpOrder) {
            // Also check Transaction collection for double safety
            const existingTx = await Transaction.findOne({ razorpayPaymentId: paymentId });
            if (!existingTx) {
              const verifiedBaseAmount = topUpOrder.baseAmount;
              const verifiedSurcharge = topUpOrder.surcharge;

              const session = await mongoose.startSession();
              session.startTransaction();
              try {
                const user = await User.findByIdAndUpdate(
                  topUpOrder.user,
                  { $inc: { walletBalance: verifiedBaseAmount } },
                  { session, new: true }
                );

                if (user) {
                  await Transaction.create([{
                    user: user._id,
                    type: 'CREDIT',
                    amount: verifiedBaseAmount,
                    description: `Wallet Top-up via Webhook (${paymentEntity?.method?.toUpperCase() || 'RAZORPAY'})`,
                    paymentMethod: paymentEntity?.method?.toUpperCase() || 'RAZORPAY',
                    razorpayOrderId: orderId,
                    razorpayPaymentId: paymentId,
                    razorpaySignature: 'WEBHOOK_VERIFIED',
                    surcharge: verifiedSurcharge
                  }], { session });
                }
                await session.commitTransaction();
                session.endSession();
                console.log(`[WEBHOOK] Wallet successfully credited for user ${topUpOrder.user}: ₹${verifiedBaseAmount}`);
              } catch (wErr) {
                await session.abortTransaction();
                session.endSession();
                throw wErr;
              }
            }
          } else {
            console.log(`[WEBHOOK] TopUpOrder ${orderId} was already credited or does not exist.`);
          }
        }
      }

      // ==========================================
      // CASE B: Flight or Hotel Booking Event
      // ==========================================
      if (orderId) {
        // Atomic compare-and-swap: only transition if currently in PAYMENT_PENDING
        const booking = await Booking.findOneAndUpdate(
          { razorpayOrderId: orderId, status: 'PAYMENT_PENDING' },
          {
            $set: {
              status: 'TICKETING_IN_PROGRESS',
              razorpayPaymentId: paymentId,
              razorpaySignature: 'WEBHOOK_VERIFIED'
            }
          },
          { new: true }
        );

        if (booking) {
          console.log(`[WEBHOOK] Acquired lock for booking ${booking.bookingId}, proceeding to ticketing...`);
          if (booking.type === 'FLIGHT' && booking.details) {
            // Logical Checkout Atomic Ticketing Claim & Duplicate Protection (Requirements 4, 5, 7, 9)
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
                console.warn(`[WEBHOOK DUPLICATE CAPTURE] Ticketing already claimed for ${booking.checkoutFingerprint}!`);
              }
            }

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
              console.warn(`[WEBHOOK DUPLICATE CAPTURE] Booking ${booking.bookingId} is duplicate. Auto-refunding.`);
              booking.status = 'CANCELLED';
              booking.cancellationReason = 'Duplicate payment detected via webhook. Full refund initiated.';
              booking.refundAmount = booking.totalAmount;
              booking.refundStatus = 'PROCESSING';

              try {
                const Razorpay = require('razorpay');
                const razorpay = new Razorpay({
                  key_id: process.env.RAZORPAY_KEY_ID || '',
                  key_secret: process.env.RAZORPAY_KEY_SECRET || ''
                });
                if (paymentId) {
                  const refund = await razorpay.payments.refund(paymentId, {
                    amount: booking.totalAmount * 100,
                    notes: {
                      reason: 'Duplicate payment auto-refund (webhook)',
                      duplicateBookingId: booking.bookingId
                    }
                  });
                  booking.refundId = refund?.id;
                  if (refund?.status === 'processed') {
                    booking.refundStatus = 'COMPLETED';
                  }
                }
              } catch (rfErr) {
                console.error('[WEBHOOK] Duplicate payment refund error:', rfErr);
                booking.refundStatus = 'FAILED';
              }

              await booking.save();

              await Transaction.create([{
                user: booking.user,
                type: 'CREDIT',
                amount: booking.totalAmount,
                description: `Auto-refund for duplicate booking payment via Webhook (${booking.bookingId})`,
                paymentMethod: 'RAZORPAY',
                razorpayPaymentId: paymentId,
                pnr: booking.bookingId
              }]);

              await Refund.create([{
                bookingId: booking._id,
                userId: booking.user,
                originalAmount: booking.totalAmount,
                deductionAmount: 0,
                refundAmount: booking.totalAmount,
                status: booking.refundStatus === 'COMPLETED' ? 'COMPLETED' : 'PROCESSING',
                reason: 'Duplicate payment auto-refund (webhook)',
                razorpayRefundId: booking.refundId
              }]);

              return res.status(200).json({ message: 'Duplicate payment auto-refunded' });
            }

            const result = await executeFlightSupplierBooking(booking.bookingId, booking.details, booking.user);
            booking.details = result.details;
            booking.markModified('details');

            if (result.isUncertainTimeout) {
              // Maintain TICKETING_IN_PROGRESS for reconciliation worker
              booking.status = 'TICKETING_IN_PROGRESS';
            } else if (result.apiBookingFailed) {
              booking.status = 'CANCELLED';
              booking.cancellationReason = 'Flight Booking API Failed - Auto Refunded';
              booking.refundAmount = booking.totalAmount;
              try {
                const Razorpay = require('razorpay');
                const razorpay = new Razorpay({
                  key_id: process.env.RAZORPAY_KEY_ID || '',
                  key_secret: process.env.RAZORPAY_KEY_SECRET || ''
                });
                if (paymentId) {
                  await razorpay.payments.refund(paymentId, {
                    amount: booking.totalAmount * 100,
                    speed: 'normal'
                  });
                  booking.refundStatus = 'COMPLETED';
                }
              } catch (rfErr) {
                console.error('[WEBHOOK] Auto-refund failed for booking:', booking.bookingId, rfErr);
                booking.refundStatus = 'FAILED';
              }
            } else {
              booking.status = 'CONFIRMED';
              try {
                const user = await User.findById(booking.user);
                if (user?.email) {
                  await sendBookingConfirmationEmail(user.email, user.name || 'Customer', booking);
                }
              } catch (emErr) {
                console.error('[WEBHOOK] Failed to send confirmation email:', emErr);
              }
            }
            await booking.save();
            console.log(`[WEBHOOK] Flight booking ${booking.bookingId} final status: ${booking.status}`);
          } else if (booking.type === 'HOTEL') {
            booking.status = 'CONFIRMED';
            await booking.save();
            console.log(`[WEBHOOK] Hotel booking ${booking.bookingId} confirmed`);
          }
        } else {
          console.log(`[WEBHOOK] Booking with order ${orderId} is not in PAYMENT_PENDING (already handled).`);
        }
      }
    } else if (eventType === 'refund.processed') {
      const refundEntity = eventPayload?.payload?.refund?.entity;
      const paymentId = refundEntity?.payment_id;
      const refundId = refundEntity?.id;
      const refundAmount = refundEntity?.amount ? refundEntity.amount / 100 : 0;
      if (paymentId) {
        // 1. Authoritative Gateway Confirmation: Set refundStatus to COMPLETED (Requirement 4)
        await Booking.updateOne(
          { razorpayPaymentId: paymentId },
          { $set: { refundStatus: 'COMPLETED', ...(refundAmount ? { refundAmount } : {}) } }
        );
        await Refund.updateOne(
          { razorpayRefundId: refundId },
          { $set: { status: 'COMPLETED' } }
        );

        // 2. Lookup original booking to check payment method
        const origBooking = await Booking.findOne({ razorpayPaymentId: paymentId });
        
        // CRITICAL FIX (Requirement 3): Gateway refunds must NEVER credit internal wallet!
        // Only credit user's internal wallet if the original payment was WALLET!
        if (origBooking && origBooking.paymentMethod === 'WALLET') {
          const existingRefundTx = await Transaction.findOne({ razorpayOrderId: refundId });
          if (!existingRefundTx) {
            await Transaction.create([{
              user: origBooking.user,
              type: 'CREDIT',
              amount: refundAmount,
              description: `Wallet Booking Refund Processed (${refundId || paymentId})`,
              paymentMethod: 'WALLET',
              razorpayPaymentId: paymentId,
              razorpayOrderId: refundId
            }]);
            await User.findByIdAndUpdate(origBooking.user, { $inc: { walletBalance: refundAmount } });
          }
        } else {
          // Gateway Card/UPI/Netbanking refund: Refund went straight to customer's bank account!
          // Record ledger audit transaction only. DO NOT TOUCH WALLET BALANCE!
          const existingRefundTx = await Transaction.findOne({ razorpayOrderId: refundId });
          if (!existingRefundTx && origBooking) {
            await Transaction.create([{
              user: origBooking.user,
              type: 'CREDIT',
              amount: refundAmount,
              description: `Gateway Source Refund Processed to Bank Account (${refundId})`,
              paymentMethod: 'RAZORPAY',
              razorpayPaymentId: paymentId,
              razorpayOrderId: refundId
            }]);
          }
        }
      }
    }

    webhookLog.status = 'PROCESSED';
    await webhookLog.save();
    return res.status(200).json({ status: 'ok' });
  } catch (error: any) {
    console.error('[WEBHOOK EXECUTION ERROR]:', error);
    webhookLog.status = 'FAILED';
    webhookLog.error = error.message;
    await webhookLog.save();
    return res.status(200).json({ status: 'error_recorded', error: error.message });
  }
};
