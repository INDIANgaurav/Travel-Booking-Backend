import express from 'express';
import { submitOfflineBooking, getOfflineBookings } from './offlineBooking.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

router.post('/', protect, submitOfflineBooking);
router.get('/', protect, getOfflineBookings);

export default router;
