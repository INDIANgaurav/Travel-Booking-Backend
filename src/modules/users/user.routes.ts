import express from 'express';
import { getUserProfile, updateUserProfile, changePassword, verifyOtp, addSavedTraveller, submitAgentOnboarding } from './user.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

router.use(protect); // All user routes require login

router.route('/profile')
  .get(getUserProfile)
  .put(updateUserProfile);

router.put('/security/password', changePassword);
router.put('/change-password', changePassword); // Keeping old one for fallback
router.post('/verify', verifyOtp);
router.post('/travellers', addSavedTraveller);

// Agent Routes
router.put('/agent/onboarding', submitAgentOnboarding);

export default router;
