import express from 'express';
import { authenticateB2BClient, searchFlights, bookFlight } from './b2bApi.controller';
import { protectB2BApi } from './b2bAuth.middleware';

const router = express.Router();

// 1. Authentication Endpoint (Publicly accessible with credentials to get session token)
router.post('/auth/token', authenticateB2BClient);

// 2. Protect all subsequent B2B endpoints (requires tokenId / Bearer token or x-api-key)
router.use(protectB2BApi);

router.get('/flights/search', searchFlights);
router.post('/flights/book', bookFlight);

export default router;
