import { Request, Response } from 'express';
import Booking from './booking.model';
import User from '../users/user.model';
import Transaction from '../wallet/wallet.model';
// 1. Agent initiates cancellation
export const initiateCancellation = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { passengerIds, reason } = req.body;
    
    const userId = (req as any).user._id;

    const booking = await Booking.findOne({ _id: bookingId, user: userId });
    
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (!['CONFIRMED', 'PARTIALLY_CANCELLED'].includes(booking.status)) {
      return res.status(400).json({ message: 'Only confirmed bookings can be cancelled.' });
    }

    if (!passengerIds || passengerIds.length === 0) {
      return res.status(400).json({ message: 'At least one passenger must be selected for cancellation.' });
    }

    let allPassengersSelected = true;
    let anyPassengerUpdated = false;

    // Update specific passengers
    booking.details.passengers?.forEach((pax: any) => {
      if (passengerIds.includes(pax._id.toString())) {
        if (pax.status !== 'CANCELLED') {
          pax.status = 'CANCEL_PENDING';
          anyPassengerUpdated = true;
        }
      }
      if (pax.status !== 'CANCEL_PENDING' && pax.status !== 'CANCELLED') {
        allPassengersSelected = false;
      }
    });

    if (!anyPassengerUpdated) {
      return res.status(400).json({ message: 'Selected passengers are already cancelled or pending cancellation.' });
    }

    booking.cancellationReason = reason;
    booking.status = 'CANCEL_PENDING'; // Overall booking status becomes pending cancellation approval
    
    await booking.save();

    res.status(200).json({ message: 'Cancellation request submitted successfully.', booking });
  } catch (error: any) {
    console.error('Initiate Cancellation Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// 2. Admin fetches all pending cancellations
export const getPendingCancellations = async (req: Request, res: Response) => {
  try {
    const pendingCancellations = await Booking.find({ status: 'CANCEL_PENDING' })
      .populate('user', 'firstName lastName companyName email')
      .sort({ createdAt: -1 });
      
    res.status(200).json(pendingCancellations);
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// 3. Admin processes/approves cancellation
export const processCancellation = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { passengerIds, cancellationPenalty, platformFee, refundAmount } = req.body;
    
    const adminId = (req as any).user._id;

    const booking = await Booking.findById(bookingId).populate('user');
    
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.status !== 'CANCEL_PENDING') {
      return res.status(400).json({ message: 'Booking is not pending cancellation.' });
    }

    const user = await User.findById((booking.user as any)._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (typeof refundAmount !== 'number' || refundAmount < 0) {
      return res.status(400).json({ message: 'Invalid refund amount.' });
    }

    // Update passengers
    let allPassengersCancelled = true;
    booking.details.passengers?.forEach((pax: any) => {
      if (passengerIds.includes(pax._id.toString())) {
        pax.status = 'CANCELLED';
      }
      if (pax.status !== 'CANCELLED') {
        allPassengersCancelled = false;
      }
    });

    booking.status = allPassengersCancelled ? 'CANCELLED' : 'PARTIALLY_CANCELLED';
    booking.cancelledAt = new Date();
    booking.refundStatus = 'COMPLETED';
    booking.cancellationPenalty = cancellationPenalty;
    booking.platformFee = platformFee;
    booking.refundAmount = refundAmount;

    // Credit Agent's Wallet
    if (refundAmount > 0) {
      user.walletBalance = (user.walletBalance || 0) + refundAmount;
      await user.save();

      // Create Transaction
      const transaction = new Transaction({
        user: user._id,
        type: 'CREDIT',
        amount: refundAmount,
        description: `Refund for Cancellation - PNR: ${booking.details.pnr || booking.bookingId}`,
        paymentMethod: 'WALLET',
        referenceNo: booking.bookingId,
        pnr: booking.details.pnr,
        penalty: cancellationPenalty,
        grossAmount: refundAmount,
        netAmountDebited: 0
      });
      await transaction.save();

    }

    await booking.save();

    res.status(200).json({ message: 'Cancellation processed successfully', booking, refundAmount });
  } catch (error: any) {
    console.error('Process Cancellation Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
