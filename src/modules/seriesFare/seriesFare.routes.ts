import express from 'express';
import {
  createSeriesFare,
  getSeriesFares,
  updateSeriesFare,
  deleteSeriesFare,
  getSupplierSummary,
  getSupplierBookingHistory,
  getSeriesFareQueue,
  updateSeriesFareQueueStatus
} from './seriesFare.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

router.route('/')
  .get(protect, getSeriesFares)
  .post(protect, createSeriesFare);

router.get('/summary', protect, getSupplierSummary);
router.get('/booking-history', protect, getSupplierBookingHistory);
router.get('/queue', protect, getSeriesFareQueue);
router.put('/queue/:id/status', protect, updateSeriesFareQueueStatus);

router.route('/:id')
  .put(protect, updateSeriesFare)
  .delete(protect, deleteSeriesFare);

export default router;
