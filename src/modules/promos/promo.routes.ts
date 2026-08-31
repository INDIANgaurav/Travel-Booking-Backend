import express from 'express';
import { protect, isAdminOrSubAdmin, isAdminOrSubAdminOrSupplier } from '../../middleware/auth.middleware';
import { 
  createPromoCode, 
  getAllPromoCodes, 
  updatePromoCode, 
  deletePromoCode, 
  validatePromoCode,
  getAvailablePromos,
  getPromoFlightDetails
} from './promo.controller';

const router = express.Router();

// Public / Agent route for validation during checkout
router.post('/validate', validatePromoCode);
router.get('/available', getAvailablePromos);

// Admin / SubAdmin / Supplier routes for CRUD
router.use(protect, isAdminOrSubAdminOrSupplier);

router.route('/')
  .post(createPromoCode)
  .get(getAllPromoCodes);

router.route('/:id')
  .put(updatePromoCode)
  .delete(deletePromoCode);

router.get('/:id/flight-details', getPromoFlightDetails);

export default router;
