import express from 'express';
import { getManageBookings } from './manageBooking.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

router.get('/', protect, getManageBookings);

export default router;
