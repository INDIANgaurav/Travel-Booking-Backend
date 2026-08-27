import express from 'express';
import multer from 'multer';
import {
  createSeriesFare,
  getSeriesFares,
  updateSeriesFare,
  deleteSeriesFare,
  getSupplierSummary,
  getSupplierBookingHistory,
  getSeriesFareQueue,
  updateSeriesFareQueueStatus,
  bulkUploadSeriesFares,
  getFDManifest,
  getArchivedFares,
  toggleArchiveStatus,
  getSlowMovingSectors,
  bulkUpdateStatus,
  bulkArchiveFares,
  bulkModifyFares,
  bulkConnectFares,
  bulkDeleteFares,
  runAutoSync,
  populateSectors
} from './seriesFare.controller';
import { protect } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/rbac.middleware';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.route('/')
  .get(protect, getSeriesFares)
  .post(protect, authorizeRoles('SUPER_ADMIN', 'SUPPLIER_AGENT', 'SUPPLIER_STAFF'), createSeriesFare);

router.post('/bulk-upload', protect, authorizeRoles('SUPER_ADMIN', 'SUPPLIER_AGENT', 'SUPPLIER_STAFF'), upload.single('file'), bulkUploadSeriesFares);
router.put('/bulk-status', protect, authorizeRoles('SUPER_ADMIN', 'SUPPLIER_AGENT', 'SUPPLIER_STAFF'), bulkUpdateStatus);
router.put('/bulk-archive', protect, authorizeRoles('SUPER_ADMIN', 'SUPPLIER_AGENT', 'SUPPLIER_STAFF'), bulkArchiveFares);
router.put('/bulk-modify', protect, authorizeRoles('SUPER_ADMIN', 'SUPPLIER_AGENT', 'SUPPLIER_STAFF'), bulkModifyFares);
router.put('/bulk-connect', protect, authorizeRoles('SUPER_ADMIN', 'SUPPLIER_AGENT', 'SUPPLIER_STAFF'), bulkConnectFares);
router.delete('/bulk-delete', protect, authorizeRoles('SUPER_ADMIN', 'SUPPLIER_AGENT', 'SUPPLIER_STAFF'), bulkDeleteFares);
router.post('/auto-sync', protect, authorizeRoles('SUPER_ADMIN', 'SUPPLIER_AGENT', 'SUPPLIER_STAFF'), runAutoSync);
router.post('/populate-sectors', protect, authorizeRoles('SUPER_ADMIN', 'SUPPLIER_AGENT', 'SUPPLIER_STAFF'), populateSectors);

router.get('/summary', protect, getSupplierSummary);
router.get('/booking-history', protect, getSupplierBookingHistory);
router.get('/queue', protect, getSeriesFareQueue);
router.put('/queue/:id/status', protect, updateSeriesFareQueueStatus);

router.get('/report/manifest/:id', protect, authorizeRoles('SUPER_ADMIN', 'SUPPLIER_AGENT', 'SUPPLIER_STAFF'), getFDManifest);
router.get('/report/slow-moving', protect, authorizeRoles('SUPER_ADMIN', 'SUPPLIER_AGENT', 'SUPPLIER_STAFF'), getSlowMovingSectors);
router.get('/archive', protect, authorizeRoles('SUPER_ADMIN', 'SUPPLIER_AGENT', 'SUPPLIER_STAFF'), getArchivedFares);
router.put('/:id/archive', protect, authorizeRoles('SUPER_ADMIN', 'SUPPLIER_AGENT', 'SUPPLIER_STAFF'), toggleArchiveStatus);

router.route('/:id')
  .put(protect, authorizeRoles('SUPER_ADMIN', 'SUPPLIER_AGENT', 'SUPPLIER_STAFF'), updateSeriesFare)
  .delete(protect, authorizeRoles('SUPER_ADMIN', 'SUPPLIER_AGENT', 'SUPPLIER_STAFF'), deleteSeriesFare);

export default router;
