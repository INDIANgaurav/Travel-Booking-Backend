import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import GroupBooking from './groupBooking.model';
import User from '../users/user.model';
import Transaction from '../wallet/wallet.model';
import mongoose from 'mongoose';

// Agent: Create a new RFQ (Request for Quote)
export const createGroupBookingRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { flightDetails, requestedSeats, remarks } = req.body;
    
    if (!requestedSeats || requestedSeats.total < 1) {
      return res.status(400).json({ message: 'Must request at least 1 seat.' });
    }

    const newRequest = new GroupBooking({
      agentId: req.user._id,
      flightDetails,
      requestedSeats,
      remarks,
      status: 'PENDING'
    });

    await newRequest.save();
    res.status(201).json({ message: 'Group booking request submitted successfully', request: newRequest });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Agent: Get my requests
export const getMyGroupBookings = async (req: AuthRequest, res: Response) => {
  try {
    const requests = await GroupBooking.find({ agentId: req.user._id }).sort({ createdAt: -1 });
    res.json(requests);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Admin: Get all requests
export const getAllGroupBookings = async (req: AuthRequest, res: Response) => {
  try {
    const requests = await GroupBooking.find().populate('agentId', 'name companyName email').sort({ createdAt: -1 });
    res.json(requests);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Admin: Provide Quote
export const quoteGroupBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { quotePrice } = req.body;

    if (!quotePrice || quotePrice <= 0) {
      return res.status(400).json({ message: 'Invalid quote price' });
    }

    const request = await GroupBooking.findById(id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    request.adminQuotePrice = quotePrice;
    request.status = 'QUOTED';
    await request.save();

    res.json({ message: 'Quote provided successfully', request });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Agent: Accept Quote & Pay
export const acceptGroupBookingQuote = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const request = await GroupBooking.findById(id).session(session);

    if (!request) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Request not found' });
    }

    if (request.status !== 'QUOTED') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Request is not in QUOTED status' });
    }

    const quoteAmount = request.adminQuotePrice || 0;
    
    // Deduct from agent's wallet
    const agent = await User.findOneAndUpdate(
      { _id: req.user._id, walletBalance: { $gte: quoteAmount } },
      { $inc: { walletBalance: -quoteAmount } },
      { session, new: true }
    );

    if (!agent) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Insufficient wallet balance' });
    }

    // Record Transaction
    await Transaction.create([{
      user: req.user._id,
      type: 'DEBIT',
      amount: quoteAmount,
      description: `Group Booking Quote Payment: ${request._id}`,
      paymentMethod: 'WALLET'
    }], { session });

    // Update Request
    request.status = 'PAID';
    request.totalPaidAmount = quoteAmount;
    await request.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Quote accepted and paid successfully', request });
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: error.message });
  }
};

// Agent: Submit Passenger Details (Fulfillment)
export const submitPassengerDetails = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { passengers } = req.body;

    const request = await GroupBooking.findById(id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    if (request.status !== 'PAID') {
      return res.status(400).json({ message: 'Cannot submit details unless the booking is paid.' });
    }

    if (!passengers || !Array.isArray(passengers) || passengers.length !== request.requestedSeats.total) {
      return res.status(400).json({ message: `Exactly ${request.requestedSeats.total} passenger details are required.` });
    }

    request.passengers = passengers;
    // We could change status to COMPLETED here or leave it PAID and let Admin fulfill PNR later
    // Let's set it to COMPLETED to indicate agent has done their part
    request.status = 'COMPLETED'; 
    await request.save();

    res.json({ message: 'Passenger details submitted successfully', request });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
