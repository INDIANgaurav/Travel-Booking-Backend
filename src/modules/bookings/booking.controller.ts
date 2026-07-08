import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import Booking from './booking.model';
import Razorpay from 'razorpay';
import crypto from 'crypto';

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
    const { totalAmount, details, date } = req.body;

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
      bookingId: `MMT-FL-${Math.floor(Math.random() * 1000000)}`,
      type: 'FLIGHT',
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
    console.error('Error creating booking:', error);
    res.status(500).json({ message: 'Failed to create booking and order' });
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

      booking.status = 'CONFIRMED';
      booking.razorpayPaymentId = razorpay_payment_id;
      booking.razorpaySignature = razorpay_signature;
      await booking.save();

      res.status(200).json({ message: 'Payment verified successfully', booking });
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

    // Allow if user is admin OR if user owns the booking
    if (req.user.role !== 'SUPER_ADMIN' && booking.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to view this booking' });
    }

    res.json(booking);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
