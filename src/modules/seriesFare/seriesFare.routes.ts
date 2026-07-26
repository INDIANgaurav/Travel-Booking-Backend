import express from 'express';
import {
  createSeriesFare,
  getSeriesFares,
  updateSeriesFare,
  deleteSeriesFare,
  getSupplierSummary,
  getSupplierBookingHistory,
} from './seriesFare.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

router.route('/')
  .get(getSeriesFares)
  .post(protect, createSeriesFare);

router.get('/summary', protect, getSupplierSummary);
router.get('/booking-history', protect, getSupplierBookingHistory);

router.route('/:id')
  .put(protect, updateSeriesFare)
  .delete(protect, deleteSeriesFare);

export default router;
