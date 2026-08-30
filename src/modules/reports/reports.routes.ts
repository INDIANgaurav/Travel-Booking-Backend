import { Router } from 'express';
import { protect, isAdminOrSubAdmin } from '../../middleware/auth.middleware';
import {
  getFlightSales,
  getCancellations,
  getHotelCancellations,
  getPassengerCalendar,
  getDebitNotes,
  getCreditNotes,
  getPgReports,
  getAgentOutstanding,
  getAgentActivation,
  getSupplierMapping,
  getFareQuotes
} from './reports.controller';

const router = Router();

// Only Admins can access reports
router.use(protect);
router.use(isAdminOrSubAdmin);

router.get('/flight-sales', getFlightSales);
router.get('/cancellations', getCancellations);
router.get('/hotel-cancellations', getHotelCancellations);
router.get('/passenger-calendar', getPassengerCalendar);
router.get('/debit-notes', getDebitNotes);
router.get('/credit-notes', getCreditNotes);
router.get('/pg-reports', getPgReports);
router.get('/agent-outstanding', getAgentOutstanding);
router.get('/agent-activation', getAgentActivation);
router.get('/supplier-mapping', getSupplierMapping);
router.get('/fare-quotes', getFareQuotes);

export default router;
