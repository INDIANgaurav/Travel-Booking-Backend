import express from 'express';
import { 
  getUserProfile, 
  updateUserProfile, 
  changePassword, 
  generateOtp,
  verifyOtp, 
  addSavedTraveller, 
  submitAgentOnboarding,
  getSupplierStaff,
  addSupplierStaff,
  updateSupplierStaff,
  deleteSupplierStaff,
  syncDomainCache,
  uploadProfilePicture,
  deleteProfilePicture
} from './user.controller';
import { protect } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/rbac.middleware';
import { avatarUpload } from '../../config/cloudinary';

const router = express.Router();

router.use(protect); // All user routes require login

router.post('/sync-domain-cache', syncDomainCache);

router.route('/profile')
  .get(getUserProfile)
  .put(updateUserProfile);

router.route('/profile-picture')
  .put(avatarUpload.single('avatar'), uploadProfilePicture)
  .delete(deleteProfilePicture);

router.put('/security/password', changePassword);
router.put('/change-password', changePassword); // Keeping old one for fallback
router.post('/generate-otp', generateOtp);
router.post('/verify', verifyOtp);
router.post('/travellers', addSavedTraveller);

// Agent Routes
router.put('/agent/onboarding', submitAgentOnboarding);

// Supplier Staff Routes (Strictly restricted to Supplier Owners & Super Admins)
const supplierStaffAuth = authorizeRoles('SUPPLIER_AGENT', 'SUPER_ADMIN');
router.route('/supplier-staff')
  .get(supplierStaffAuth, getSupplierStaff)
  .post(supplierStaffAuth, addSupplierStaff);
router.route('/supplier-staff/:id')
  .put(supplierStaffAuth, updateSupplierStaff)
  .delete(supplierStaffAuth, deleteSupplierStaff);

export default router;
