import express from 'express';
import { initiateCancellation, getPendingCancellations, processCancellation } from './cancellation.controller';
import { protect, isAdmin } from '../../middleware/auth.middleware';

const router = express.Router();

// Agent initiates cancellation
router.post('/initiate/:bookingId', protect, initiateCancellation);

// Admin fetches pending requests
router.get('/pending', protect, isAdmin, getPendingCancellations);

// Admin processes/approves cancellation
router.post('/process/:bookingId', protect, isAdmin, processCancellation);

export default router;
