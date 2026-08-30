import express from 'express';
import { protect, isAdminOrSubAdmin } from '../../middleware/auth.middleware';
import {
  createCommissionPlan,
  getCommissionPlans,
  deleteCommissionPlan,
  createCommissionGroup,
  getCommissionGroups
} from './commission.controller';

const router = express.Router();

router.use(protect);
router.use(isAdminOrSubAdmin);

// Plans
router.post('/', createCommissionPlan);
router.get('/', getCommissionPlans);
router.delete('/:id', deleteCommissionPlan);

// Groups
router.post('/groups', createCommissionGroup);
router.get('/groups', getCommissionGroups);

export default router;
