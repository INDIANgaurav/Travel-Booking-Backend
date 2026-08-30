import express from 'express';
import { getUsers, getUserById, approveAgent, updateUser, createSubAdmin, createAgent, getAllBookings, deleteUser, getPendingQueue } from './admin.controller';
import { 
  getAllOfflineBookings, updateOfflineBookingStatus,
  getAllTaxInvoices, updateTaxInvoiceStatus,
  getAllGstInvoices, updateGstInvoiceStatus,
  getAllCreditNotes, updateCreditNoteStatus,
  getAllDebitNotes, updateDebitNoteStatus,
  getAllMarkups, updateMarkupStatus,
  getAllBankDetails, updateBankDetailsStatus
} from './admin.b2b.controller';
import { protect } from '../../middleware/auth.middleware';
import { authorizeRoles, authorizeDepartments } from '../../middleware/rbac.middleware';

const router = express.Router();

router.use(protect);

router.get('/users', authorizeRoles('SUPER_ADMIN', 'SUB_ADMIN'), getUsers);
router.get('/bookings', authorizeRoles('SUPER_ADMIN', 'SUB_ADMIN'), getAllBookings);
router.get('/pending-queue', authorizeRoles('SUPER_ADMIN', 'SUB_ADMIN'), getPendingQueue);

router.put(
  '/agents/:id/approve',
  authorizeRoles('SUPER_ADMIN', 'SUB_ADMIN'),
  authorizeDepartments('Sales', 'Operations'),
  approveAgent
);

router.get('/users/:id', authorizeRoles('SUPER_ADMIN', 'SUB_ADMIN'), getUserById);
router.put('/users/:id', authorizeRoles('SUPER_ADMIN'), updateUser);
router.delete('/users/:id', authorizeRoles('SUPER_ADMIN'), deleteUser);
router.post('/subadmins', authorizeRoles('SUPER_ADMIN'), createSubAdmin);
router.post('/agents', authorizeRoles('SUPER_ADMIN'), createAgent);

// B2B Requests Routes
const b2bAuth = authorizeRoles('SUPER_ADMIN', 'SUB_ADMIN');

router.get('/b2b/offline-bookings', b2bAuth, getAllOfflineBookings);
router.put('/b2b/offline-bookings/:id', b2bAuth, updateOfflineBookingStatus);

router.get('/b2b/tax-invoices', b2bAuth, getAllTaxInvoices);
router.put('/b2b/tax-invoices/:id', b2bAuth, updateTaxInvoiceStatus);

router.get('/b2b/gst-invoices', b2bAuth, getAllGstInvoices);
router.put('/b2b/gst-invoices/:id', b2bAuth, updateGstInvoiceStatus);

router.get('/b2b/credit-notes', b2bAuth, getAllCreditNotes);
router.put('/b2b/credit-notes/:id', b2bAuth, updateCreditNoteStatus);

router.get('/b2b/debit-notes', b2bAuth, getAllDebitNotes);
router.put('/b2b/debit-notes/:id', b2bAuth, updateDebitNoteStatus);

router.get('/b2b/markups', b2bAuth, getAllMarkups);
router.put('/b2b/markups/:id', b2bAuth, updateMarkupStatus);

router.get('/b2b/bank-details', b2bAuth, getAllBankDetails);
router.put('/b2b/bank-details/:id', b2bAuth, updateBankDetailsStatus);

export default router;
