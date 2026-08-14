import express from 'express';
import { 
  getUserProfile, 
  updateUserProfile, 
  changePassword, 
  verifyOtp, 
  addSavedTraveller, 
  submitAgentOnboarding,
  getSupplierStaff,
  addSupplierStaff,
  updateSupplierStaff,
  deleteSupplierStaff
} from './user.controller';
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

// Supplier Staff Routes
router.route('/supplier-staff')
  .get(getSupplierStaff)
  .post(addSupplierStaff);
router.route('/supplier-staff/:id')
  .put(updateSupplierStaff)
  .delete(deleteSupplierStaff);

export default router;
