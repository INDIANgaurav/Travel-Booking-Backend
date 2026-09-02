import { Router } from 'express';
import { protect, isAdminOrSubAdmin } from '../../middleware/auth.middleware';
import {
  createTicket,
  getMyTickets,
  getAllTickets,
  getTicketById,
  replyToTicket,
  updateTicketStatus
} from './ticket.controller';

const router = Router();

// Routes for any authenticated user (B2C, B2B Agent, Supplier)
router.use(protect);

router.post('/', createTicket);
router.get('/my', getMyTickets);
router.get('/:id', getTicketById);
router.post('/:id/reply', replyToTicket);

// Admin / SubAdmin only routes
router.use(isAdminOrSubAdmin);
router.get('/', getAllTickets);
router.put('/:id/status', updateTicketStatus);

export default router;
