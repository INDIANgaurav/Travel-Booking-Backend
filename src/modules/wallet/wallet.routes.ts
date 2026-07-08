import express from 'express';
import { getWallet, addMoney } from './wallet.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

router.use(protect);

router.get('/', getWallet);
router.post('/add', addMoney);

export default router;
