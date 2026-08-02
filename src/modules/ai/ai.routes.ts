import { Router } from 'express';
import { chatWithAI } from './ai.controller';

const router = Router();

// POST /api/ai/chat — Send a message and get AI response
router.post('/chat', chatWithAI);

export default router;
