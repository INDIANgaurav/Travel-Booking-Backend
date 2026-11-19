import SeatHold from './modules/seriesFare/seatHold.model';
import SeriesFare from './modules/seriesFare/seriesFare.model';
import Booking from './modules/bookings/booking.model';
import User from './modules/users/user.model';
import CronLock from './modules/system/cronLock.model';
import { sendBookingConfirmationEmail } from './utils/email.service';

export const startCronJobs = () => {
  // 1. SeatHold Cleanup (Runs every 1 minute)
  setInterval(async () => {
    try {
      const expiredHolds = await SeatHold.find({
        status: 'ACTIVE',
        expiresAt: { $lt: new Date() }
      });

      for (const hold of expiredHolds) {
        hold.status = 'EXPIRED';
        await hold.save();
        
        await SeriesFare.updateOne(
          { _id: hold.flightId },
          { $inc: { availableSeats: hold.paxCount }, $set: { status: 'Active' } }
        );
        console.log(`Cron: Released ${hold.paxCount} seats for expired hold ${hold._id}`);
      }
      if (expiredHolds.length > 0) {
        const { clearFlightSearchCache } = require('./modules/searches/search.controller');
        clearFlightSearchCache();
      }
    } catch (error) {
      console.error('Error in SeatHold cleanup cron:', error);
    }
  }, 60 * 1000);

  // 2. Automated Booking & Supplier Status Reconciliation (Runs every 3 minutes)
  // Protected with MongoDB distributed lock across multiple PM2 instances / containers
  setInterval(async () => {
    const lockId = 'cron_booking_reconciliation';
    const now = new Date();
    const lockDuration = 2.5 * 60 * 1000; // 2.5 minutes lease

    let lockAcquired = false;
    try {
      const lock = await CronLock.findOneAndUpdate(
        {
          _id: lockId,
          $or: [{ lockedUntil: { $lt: now } }, { lockedUntil: { $exists: false } }]
        },
        { $set: { lockedUntil: new Date(now.getTime() + lockDuration), lockedBy: `pid_${process.pid}` } },
        { upsert: true, new: true }
      );
      if (lock && lock.lockedBy === `pid_${process.pid}`) {
        lockAcquired = true;
      }
    } catch (lockErr) {
      // Duplicate key or concurrent conflict -> another instance holds the lock
      return;
    }

    if (!lockAcquired) return;

    try {
      const threeMinsAgo = new Date(Date.now() - 3 * 60 * 1000);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // A. Reconcile bookings in TICKETING_IN_PROGRESS
      const pendingTicketing = await Booking.find({
        status: 'TICKETING_IN_PROGRESS',
        type: 'FLIGHT',
        createdAt: { $lt: threeMinsAgo, $gt: oneDayAgo }
      }).limit(15);

      for (const booking of pendingTicketing) {
        try {
          const details: any = booking.details || {};
          const attempts = Number(details.reconciliationAttempts || 0);

          // Bounded retry policy: After 10 attempts, flag for manual review to prevent supplier throttling
          if (attempts >= 10) {
            if (details.supplierStatus !== 'REQUIRES_MANUAL_REVIEW') {
              (booking.details as any).supplierStatus = 'REQUIRES_MANUAL_REVIEW';
              booking.markModified('details');
              await booking.save();
              console.warn(`[RECONCILIATION ESCALATION] Booking ${booking.bookingId} reached 10 attempts without supplier confirmation. Flagged for manual support.`);
            }
            continue;
          }

          (booking.details as any).reconciliationAttempts = attempts + 1;
          booking.markModified('details');

          // --- Reconcile AirIQ ---
          if (details.airIq_booking_id || details.isAirIqFare) {
            const airIqBookingId = details.airIq_booking_id || details.pnr;
            if (airIqBookingId) {
              const { getTicketAirIq } = require('./modules/flights/airiq.service');
              const ticketInfo = await getTicketAirIq(airIqBookingId);
              const airlinePnr = ticketInfo?.data?.pnr || ticketInfo?.data?.airline_pnr || ticketInfo?.pnr;
              if (airlinePnr) {
                (booking.details as any).pnr = airlinePnr;
                (booking.details as any).airIq_ticket_details = ticketInfo;
                booking.markModified('details');
                booking.status = 'CONFIRMED';
                await booking.save();
                console.log(`[RECONCILIATION] AirIQ Booking ${booking.bookingId} confirmed with PNR: ${airlinePnr}`);
                
                const user = await User.findById(booking.user);
                if (user?.email) {
                  await sendBookingConfirmationEmail(user.email, user.name || 'Customer', booking);
                }
                continue;
              }
            }
          }

          // --- Reconcile GAPI ---
          else if (details.txid || details.isGapiFare) {
            const txid = details.txid || details.pnr;
            if (txid) {
              const { getBookingDetails: getBookingDetailsGapi } = require('./modules/flights/gapi.service');
              const bookingInfo = await getBookingDetailsGapi(txid);
              const airlinePnr = bookingInfo?.FlightBookingSecotorDetails?.[0]?.passengerInfo?.[0]?.airlinepnr;
              if (airlinePnr || bookingInfo?.bookingstatus === 'Confirmed') {
                if (airlinePnr) (booking.details as any).pnr = airlinePnr;
                (booking.details as any).gapi_booking_details = bookingInfo;
                booking.markModified('details');
                booking.status = 'CONFIRMED';
                await booking.save();
                console.log(`[RECONCILIATION] GAPI Booking ${booking.bookingId} confirmed with PNR: ${airlinePnr || txid}`);
                
                const user = await User.findById(booking.user);
                if (user?.email) {
                  await sendBookingConfirmationEmail(user.email, user.name || 'Customer', booking);
                }
                continue;
              }
            }
          }

          // --- Reconcile NexusDMC ---
          else if (details.nexus_query || details.flight_keys) {
            const ref = details.agent_reference || booking.bookingId.replace(/-/g, '');
            const { fetchBookingDetails } = require('./modules/flights/nexusdmc.service');
            try {
              const nexusInfo = await fetchBookingDetails(ref);
              if (nexusInfo && (nexusInfo.success || nexusInfo.pnr)) {
                (booking.details as any).pnr = nexusInfo.pnr || nexusInfo.response_ref;
                (booking.details as any).nexus_response = nexusInfo;
                booking.markModified('details');
                booking.status = 'CONFIRMED';
                await booking.save();
                console.log(`[RECONCILIATION] Nexus Booking ${booking.bookingId} confirmed with PNR: ${(booking.details as any).pnr}`);

                const user = await User.findById(booking.user);
                if (user?.email) {
                  await sendBookingConfirmationEmail(user.email, user.name || 'Customer', booking);
                }
                continue;
              }
            } catch (_) {}
          }

          await booking.save();
        } catch (singleReconErr: any) {
          console.warn(`[RECONCILIATION] Note checking booking ${booking.bookingId}:`, singleReconErr.message);
        }
      }

      // B. Reconcile stale PAYMENT_PENDING orders older than 45 minutes
      // STRICT RULE: Never expire a payment without verifying with Razorpay gateway!
      const fortyFiveMinsAgo = new Date(Date.now() - 45 * 60 * 1000);
      const stalePendingOrders = await Booking.find({
        status: 'PAYMENT_PENDING',
        createdAt: { $lt: fortyFiveMinsAgo, $gt: oneDayAgo }
      }).limit(20);

      for (const staleBooking of stalePendingOrders) {
        if (staleBooking.razorpayOrderId) {
          try {
            const Razorpay = require('razorpay');
            const razorpay = new Razorpay({
              key_id: process.env.RAZORPAY_KEY_ID || '',
              key_secret: process.env.RAZORPAY_KEY_SECRET || ''
            });

            const payments: any = await razorpay.orders.fetchPayments(staleBooking.razorpayOrderId);
            const captured = payments?.items?.find((p: any) => p.status === 'captured' || p.status === 'authorized');

            if (captured) {
              // CUSTOMER ACTUALLY PAID! Recover the booking immediately
              staleBooking.status = 'TICKETING_IN_PROGRESS';
              staleBooking.razorpayPaymentId = captured.id;
              staleBooking.razorpaySignature = 'CRON_RECONCILED';
              await staleBooking.save();
              console.log(`[RECONCILIATION] Stale order ${staleBooking.razorpayOrderId} was PAID at gateway (Payment ID: ${captured.id}). Resuming ticketing!`);
              continue;
            }
          } catch (payFetchErr: any) {
            console.warn(`[RECONCILIATION] Could not verify gateway for order ${staleBooking.razorpayOrderId}, deferring expiration:`, payFetchErr.message);
            // If gateway API failed/timed out, DO NOT mark FAILED. Give it another chance next run.
            continue;
          }
        }

        // Only expire if verified that no captured payment exists
        staleBooking.status = 'FAILED';
        staleBooking.cancellationReason = 'Payment session timed out without customer completion';
        await staleBooking.save();
      }

    } catch (reconErr) {
      console.error('[CRON ERROR] Booking reconciliation error:', reconErr);
    } finally {
      // Release lock
      try {
        await CronLock.updateOne({ _id: lockId }, { $set: { lockedUntil: new Date() } });
      } catch (_) {}
    }
  }, 3 * 60 * 1000);
};
