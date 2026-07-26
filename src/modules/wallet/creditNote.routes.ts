import express from 'express';
import { requestCreditNote, getCreditNotes } from './creditNote.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

router.post('/', protect, requestCreditNote);
router.get('/', protect, getCreditNotes);

export default router;
