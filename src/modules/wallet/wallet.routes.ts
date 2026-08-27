import express from 'express';
import { getWallet, addMoney, createTopUpOrder, verifyTopUpPayment, submitOfflineTopUp, getOfflineTopUps, approveOfflineTopUp, rejectOfflineTopUp, getMyOfflineTopUps, submitWithdrawalRequest, getMyWithdrawalRequests, getAllWithdrawalRequests, updateWithdrawalRequest } from './wallet.controller';
import { protect, isAdminOrSubAdmin } from '../../middleware/auth.middleware';

const router = express.Router();

router.use(protect);

router.get('/', getWallet);
router.post('/add', addMoney);
router.post('/create-order', createTopUpOrder);
router.post('/verify-payment', verifyTopUpPayment);

// Offline Top-Up Routes
router.post('/offline-topup', submitOfflineTopUp);
router.get('/offline-topup/my-requests', getMyOfflineTopUps);
router.get('/offline-topup', isAdminOrSubAdmin, getOfflineTopUps);
router.put('/offline-topup/:id/approve', isAdminOrSubAdmin, approveOfflineTopUp);
router.put('/offline-topup/:id/reject', isAdminOrSubAdmin, rejectOfflineTopUp);

// Withdrawal Request Routes
router.post('/withdrawal-request', submitWithdrawalRequest);
router.get('/withdrawal-requests', getMyWithdrawalRequests);
router.get('/admin/withdrawals', isAdminOrSubAdmin, getAllWithdrawalRequests);
router.put('/admin/withdrawals/:id', isAdminOrSubAdmin, updateWithdrawalRequest);

export default router;
