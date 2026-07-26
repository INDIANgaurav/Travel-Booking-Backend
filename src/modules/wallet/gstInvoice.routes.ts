import express from 'express';
import { submitGstInvoice, getGstInvoices } from './gstInvoice.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

router.post('/', protect, submitGstInvoice);
router.get('/', protect, getGstInvoices);

export default router;
