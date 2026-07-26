import express from 'express';
import { saveBankDetails, getBankDetails } from './bankDetails.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

router.post('/', protect, saveBankDetails);
router.get('/', protect, getBankDetails);

export default router;
