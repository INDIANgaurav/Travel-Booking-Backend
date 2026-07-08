import express from 'express';
import { manageAgentProfile, getAgentWallet } from './agent.controller';
import { protect } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/rbac.middleware';

const router = express.Router();

router.use(protect);
router.use(authorizeRoles('AGENT')); // Only agents can access these routes

router.route('/profile').post(manageAgentProfile);
router.get('/wallet', getAgentWallet);

export default router;
