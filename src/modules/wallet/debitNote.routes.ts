import express from 'express';
import { requestDebitNote, getDebitNotes } from './debitNote.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

router.post('/', protect, requestDebitNote);
router.get('/', protect, getDebitNotes);

export default router;
