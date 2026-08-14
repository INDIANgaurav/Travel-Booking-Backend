import express from 'express';
import { submitGstInvoice, getGstInvoices, calculateGstInvoice } from './gstInvoice.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

router.get('/calculate', protect, calculateGstInvoice);
router.post('/', protect, submitGstInvoice);
router.get('/', protect, getGstInvoices);

export default router;
