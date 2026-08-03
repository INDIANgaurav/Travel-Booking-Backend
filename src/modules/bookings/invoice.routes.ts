import express from 'express';
import { requestTaxInvoice, getTaxInvoices, deleteTaxInvoice } from './invoice.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

router.post('/', protect, requestTaxInvoice);
router.get('/', protect, getTaxInvoices);
router.delete('/:id', protect, deleteTaxInvoice);

export default router;
