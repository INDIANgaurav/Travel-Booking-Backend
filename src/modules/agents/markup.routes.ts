import express from 'express';
import { createMarkup, getMarkups, deleteMarkup } from './markup.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

router.post('/', protect, createMarkup);
router.get('/', protect, getMarkups);
router.delete('/:id', protect, deleteMarkup);

export default router;
