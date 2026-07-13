import { Router } from 'express';
import { registerHotel, searchHotels, getMyProperties, updateMyProperty, deleteMyProperty, getAllProperties, updatePropertyStatus, deletePropertyAdmin } from './hotel.controller';
import { protect, isAdminOrSubAdmin } from '../../middleware/auth.middleware';
import { upload } from '../../config/cloudinary';

const router = Router();

// Public route to search hotels
router.get('/search', searchHotels);

// Protected routes for User's own properties
router.get('/my-properties', protect, getMyProperties);
router.put('/my-properties/:id', protect, updateMyProperty);
router.delete('/my-properties/:id', protect, deleteMyProperty);

// Protected route to register a new hotel (up to 5 images)
router.post('/register', protect, upload.array('images', 5), registerHotel);

// Admin / SubAdmin routes
router.get('/admin', protect, isAdminOrSubAdmin, getAllProperties);
router.patch('/admin/:id/status', protect, isAdminOrSubAdmin, updatePropertyStatus);
router.delete('/admin/:id', protect, isAdminOrSubAdmin, deletePropertyAdmin);

export default router;
