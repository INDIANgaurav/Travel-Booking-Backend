import express from 'express';
import { getMyBookings, createFlightBooking, verifyPayment, getBookingById, createHotelBooking, getCancellationPreview, cancelBooking } from './booking.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

router.use(protect);

router.get('/my-bookings', getMyBookings);
router.post('/flight', createFlightBooking);
router.post('/hotel', createHotelBooking);
router.post('/payment/verify', verifyPayment);
router.get('/:id', getBookingById);
router.get('/:id/cancellation-preview', getCancellationPreview);
router.post('/:id/cancel', cancelBooking);

export default router;
