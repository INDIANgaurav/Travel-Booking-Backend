import express from 'express';
import { protect, isAdminOrSubAdmin } from '../../middleware/auth.middleware';
import { 
  addBank, 
  getBanks, 
  deleteBank, 
  raisePayment, 
  getPayments, 
  updatePaymentStatus 
} from './finance.controller';

const router = express.Router();

// Only ADMIN roles
router.use(protect);
router.use(isAdminOrSubAdmin);

// Banks
router.post('/bank', addBank);
router.get('/bank', getBanks);
router.delete('/bank/:id', deleteBank);

// Payments
router.post('/payment', raisePayment);
router.get('/payment', getPayments);
router.put('/payment/:id/status', updatePaymentStatus);

export default router;
