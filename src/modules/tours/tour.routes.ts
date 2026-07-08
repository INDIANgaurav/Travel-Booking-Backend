import express from 'express';
import { 
  getDestinations, 
  createDestination, 
  getTourPackages, 
  getTourPackageBySlug, 
  createTourPackage 
} from './tour.controller';
import { protect } from '../../middleware/auth.middleware';
import { authorizeRoles, authorizeDepartments } from '../../middleware/rbac.middleware';

const router = express.Router();

// --- DESTINATIONS ---
router.route('/destinations')
  .get(getDestinations)
  .post(protect, authorizeRoles('SUPER_ADMIN', 'SUB_ADMIN'), authorizeDepartments('Operations'), createDestination);

// --- TOUR PACKAGES ---
router.route('/packages')
  .get(getTourPackages)
  .post(protect, authorizeRoles('SUPER_ADMIN', 'SUB_ADMIN'), authorizeDepartments('Operations'), createTourPackage);

router.get('/packages/:slug', getTourPackageBySlug);

export default router;
