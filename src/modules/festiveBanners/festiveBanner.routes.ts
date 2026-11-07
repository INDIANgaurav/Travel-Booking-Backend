import express from 'express';
import {
  getActiveBanners,
  getAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  toggleBannerStatus
} from './festiveBanner.controller';
import { protect, isAdminOrSubAdmin } from '../../middleware/auth.middleware';

const router = express.Router();

// Public route for frontend client / landing page
router.get('/active', getActiveBanners);

// Protected Admin management routes
router.use(protect);
router.use(isAdminOrSubAdmin);

router.get('/', getAllBanners);
router.post('/', createBanner);
router.put('/:id', updateBanner);
router.delete('/:id', deleteBanner);
router.patch('/:id/toggle', toggleBannerStatus);

export default router;
