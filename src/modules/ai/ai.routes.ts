import { Router } from 'express';
import { chatWithAI } from './ai.controller';
import { protect } from '../../middleware/auth.middleware';

const router = Router();

// POST /api/ai/chat — Send a message and get AI response (Authenticated)
router.post('/chat', protect, chatWithAI);

export default router;
