import express from 'express';
import { getUsers, approveAgent, updateUserRole, createSubAdmin, getAllBookings, deleteUser } from './admin.controller';
import { protect } from '../../middleware/auth.middleware';
import { authorizeRoles, authorizeDepartments } from '../../middleware/rbac.middleware';

const router = express.Router();

router.use(protect);

router.get('/users', authorizeRoles('SUPER_ADMIN', 'SUB_ADMIN'), getUsers);
router.get('/bookings', authorizeRoles('SUPER_ADMIN', 'SUB_ADMIN'), getAllBookings);

router.put(
  '/agents/:id/approve',
  authorizeRoles('SUPER_ADMIN', 'SUB_ADMIN'),
  authorizeDepartments('Sales', 'Operations'),
  approveAgent
);

router.put('/users/:id', authorizeRoles('SUPER_ADMIN'), updateUserRole);
router.delete('/users/:id', authorizeRoles('SUPER_ADMIN'), deleteUser);
router.post('/subadmins', authorizeRoles('SUPER_ADMIN'), createSubAdmin);

export default router;
