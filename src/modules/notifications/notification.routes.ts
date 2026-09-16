import express from 'express';
import { getNotifications, markAsRead, createAdminNotification, clearAllNotifications, deleteNotification } from './notification.controller';
import { protect, isAdminOrSubAdmin } from '../../middleware/auth.middleware';

const router = express.Router();

router.get('/test', async (req, res) => {
  await createAdminNotification(
    'Test Notification',
    'This is a test notification to check the real-time popup and count!',
    'SYSTEM',
    '/admin/notifications'
  );
  res.json({ message: 'Test notification fired! Check your Admin Dashboard tab.' });
});

router.use(protect);
router.use(isAdminOrSubAdmin);

router.get('/', getNotifications);
router.post('/read', markAsRead);
router.delete('/clear', clearAllNotifications);
router.delete('/:id', deleteNotification);

export default router;
