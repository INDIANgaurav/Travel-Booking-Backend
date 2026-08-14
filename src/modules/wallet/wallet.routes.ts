import express from 'express';
import { getWallet, addMoney, createTopUpOrder, verifyTopUpPayment } from './wallet.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

router.use(protect);

router.get('/', getWallet);
router.post('/add', addMoney);
router.post('/create-order', createTopUpOrder);
router.post('/verify-payment', verifyTopUpPayment);

export default router;
