import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import Booking from './booking.model';
import Refund from './refund.model';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { bookFlight } from '../flights/nexusdmc.service';
import SeriesFare from '../seriesFare/seriesFare.model';

export const getMyBookings = async (req: AuthRequest, res: Response) => {
  try {
    const bookings = await Booking.find({ user: req.user._id }).sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createFlightBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { totalAmount, details, date, bookingMode = 'PERSONAL' } = req.body;

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    });

    // 1. Create Razorpay Order
    const options = {
      amount: totalAmount * 100, // amount in smallest currency unit (paise)
      currency: "INR",
      receipt: `receipt_${Date.now()}`
    };
    
    const order = await razorpay.orders.create(options);

    // 2. Create Booking in DB (Status: PENDING)
    const newBooking = new Booking({
      user: req.user._id,
      bookingId: `BKG-FL-${Math.floor(Math.random() * 1000000)}`,
      type: 'FLIGHT',
      bookingMode,
      status: 'PENDING',
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
    console.error('Error creating flight booking:', error);
    res.status(500).json({ message: 'Failed to create flight booking and order' });
  }
};

export const createHotelBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { totalAmount, details, date, bookingMode = 'PERSONAL' } = req.body;

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
      status: 'PENDING',
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
      if (booking.type === 'FLIGHT' && details && details.nexus_query) {
        try {
          const { nexus_query, flight_keys, total_price, currency, passengers, contactDetails } = details;
          
          // Map passengers to NexusDMC expected format
          const paxes = (passengers || []).map((p: any) => {
            const isChildOrInfant = p.type?.toUpperCase() === 'CHILD' || p.type?.toUpperCase() === 'INFANT';
            let finalTitle = p.title || (p.gender === 'Male' ? (isChildOrInfant ? 'Mstr' : 'Mr') : (isChildOrInfant ? 'Miss' : 'Ms'));
            
            // Normalize to Title Case and strictly enforce valid titles per passenger type
            let upperTitle = finalTitle.toUpperCase();
            
            if (isChildOrInfant) {
              if (upperTitle === 'MR' || upperTitle === 'MSTR') finalTitle = 'Mstr';
              else if (upperTitle === 'MS' || upperTitle === 'MRS' || upperTitle === 'MISS') finalTitle = 'Miss';
              else finalTitle = 'Mstr'; // fallback
            } else {
              if (upperTitle === 'MSTR' || upperTitle === 'MR') finalTitle = 'Mr';
              else if (upperTitle === 'MISS' || upperTitle === 'MS') finalTitle = 'Ms';
              else if (upperTitle === 'MRS') finalTitle = 'Mrs';
              else finalTitle = 'Mr'; // fallback
            }

            let defaultDob = '1990-01-01';
            if (p.type?.toUpperCase() === 'CHILD') defaultDob = '2018-01-01'; // 8 years old
            if (p.type?.toUpperCase() === 'INFANT') defaultDob = '2025-01-01'; // 1 year old
            
            return {
              title: finalTitle,
            first_name: p.name.split(' ')[0] || 'Unknown',
            last_name: p.name.split(' ').slice(1).join(' ') || 'User',
            dob: p.dob ? new Date(p.dob).toISOString().split('T')[0] : defaultDob,
            passport_num: p.passportNum || null,
            passport_expiry_date: p.passportExpiry ? new Date(p.passportExpiry).toISOString().split('T')[0] : null,
            nationality: p.nationality || 'IN',
            type: isChildOrInfant ? (p.type?.toUpperCase() === 'CHILD' ? 'child' : 'infant') : 'adult'
          };
          });

          const client_details = {
            email: contactDetails?.email || '',
            phone: contactDetails?.phone || ''
          };

          const agent_reference = booking.bookingId.replace(/-/g, '');

          const bookResult = await bookFlight(nexus_query, flight_keys, total_price, currency, paxes, client_details, agent_reference);
          
          if (bookResult && bookResult.success) {
            // Update booking with PNR from NexusDMC
            details.pnr = bookResult.response_ref; // Using response_ref as PNR for now
            details.nexus_response = bookResult;
            booking.details = details;
            booking.markModified('details');
          } else {
            apiBookingFailed = true;
            details.api_error = bookResult?.error_msg || 'Nexus returned false success';
            booking.details = details;
            booking.markModified('details');
          }
        } catch (nexusError: any) {
          console.error('NexusDMC Booking failed after payment:', nexusError);
          // We still confirm the payment but might need manual intervention for the ticket
          apiBookingFailed = true;
          details.api_error = nexusError.message || 'Exception during Nexus booking';
          booking.details = details;
          booking.markModified('details');
        }
      } else if (booking.type === 'FLIGHT' && details && details.flight_keys && details.flight_keys.length > 0) {
        try {
          const sfId = details.flight_keys[0];
          const passengers = details.passengers || [];
          
          let seatCount = 0;
          if (passengers.length > 0) {
             seatCount = passengers.filter((p: any) => p.type?.toUpperCase() !== 'INFANT' || p.needsSeat).length;
          } else if (details.seats && Array.isArray(details.seats)) {
             seatCount = details.seats.length;
          }
          if (seatCount === 0) seatCount = 1;

          const sfIdClean = sfId.replace('SF_', '');
          
          // Check if valid ObjectId to prevent CastError
          const mongoose = require('mongoose');
          if (mongoose.Types.ObjectId.isValid(sfIdClean)) {
            const seriesFare = await SeriesFare.findById(sfIdClean);
            if (seriesFare) {
               seriesFare.availableSeats = Math.max(0, seriesFare.availableSeats - seatCount);
               if (seriesFare.availableSeats === 0) {
                   seriesFare.status = 'SoldOut';
               }
               await seriesFare.save();
               
               // Assign the group PNR to the customer's booking
               details.pnr = seriesFare.airlinePnr || 'PENDING';
               booking.details = details;
               booking.markModified('details');
            }
          }
        } catch (sfError) {
          console.error('Failed to decrement SeriesFare seats:', sfError);
        }
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
    const allowedRoles = ['SUPER_ADMIN', 'SUB_ADMIN', 'SUPPLIER_AGENT'];
    if (!allowedRoles.includes(req.user.role) && booking.user._id.toString() !== req.user._id.toString()) {
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

    if (booking.status !== 'CONFIRMED' && booking.status !== 'PENDING') {
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

    if (booking.status !== 'CONFIRMED' && booking.status !== 'PENDING') {
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

    // Trigger Razorpay Refund if payment was made via Razorpay and refund > 0
    if (booking.razorpayPaymentId && refundAmount > 0) {
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
      }
    } else if (refundAmount === 0) {
      booking.refundStatus = 'NONE';
    }

    await booking.save();

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
