import express from 'express';
import { getPaxCalendarStats } from './paxCalendar.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

router.get('/', protect, getPaxCalendarStats);

export default router;
