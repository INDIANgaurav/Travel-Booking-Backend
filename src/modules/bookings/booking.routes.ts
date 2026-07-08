import express from 'express';
import { getMyBookings, createFlightBooking, verifyPayment, getBookingById } from './booking.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

router.use(protect);

router.get('/my-bookings', getMyBookings);
router.post('/flight', createFlightBooking);
router.post('/payment/verify', verifyPayment);
router.get('/:id', getBookingById);

export default router;
