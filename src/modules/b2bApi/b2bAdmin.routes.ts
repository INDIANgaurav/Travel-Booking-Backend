import express from 'express';
import { createB2BClient, getB2BClients, updateB2BClient } from './b2bAdmin.controller';
import { protect } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/rbac.middleware';

const router = express.Router();

// Only SUPER_ADMIN can manage B2B API Partners
router.use(protect, authorizeRoles('SUPER_ADMIN'));

router.route('/')
  .post(createB2BClient)
  .get(getB2BClients);

router.route('/:id')
  .put(updateB2BClient);

export default router;
