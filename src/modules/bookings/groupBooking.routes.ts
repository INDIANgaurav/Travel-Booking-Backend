import express from 'express';
import { protect, isAdminOrSubAdmin } from '../../middleware/auth.middleware';
import {
  createGroupBookingRequest,
  getMyGroupBookings,
  getAllGroupBookings,
  quoteGroupBooking,
  acceptGroupBookingQuote,
  submitPassengerDetails
} from './groupBooking.controller';

const router = express.Router();

// Agent routes
router.post('/request', protect, createGroupBookingRequest);
router.get('/my-requests', protect, getMyGroupBookings);
router.post('/:id/accept', protect, acceptGroupBookingQuote);
router.post('/:id/passengers', protect, submitPassengerDetails);

// Admin routes
router.get('/', protect, isAdminOrSubAdmin, getAllGroupBookings);
router.put('/:id/quote', protect, isAdminOrSubAdmin, quoteGroupBooking);

export default router;
