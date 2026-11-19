import express from 'express';
import { handleRazorpayWebhook } from './webhook.controller';

const router = express.Router();

// Razorpay Webhook Endpoint (Unauthenticated, signature verified internally)
router.post('/razorpay', handleRazorpayWebhook);

export default router;

