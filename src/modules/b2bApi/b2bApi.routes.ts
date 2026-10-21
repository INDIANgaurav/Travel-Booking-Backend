import express from 'express';
import { authenticateB2BClient, getSectors, searchFlights, bookFlight } from './b2bApi.controller';
import { protectB2BApi } from './b2bAuth.middleware';

const router = express.Router();

// 1. Authentication Endpoints (Exact GAPI OAuth2 path & standard auth path)
router.post('/oauth2/tokens', authenticateB2BClient);
router.post('/auth/token', authenticateB2BClient);

// 2. Protect all subsequent B2B endpoints (requires tokenId / Bearer token or x-api-key)
router.use(protectB2BApi);

// 3. Flight Sector Methods (GAPI /search/sectors & /flights/sectors)
router.get('/search/sectors', getSectors);
router.get('/flights/sectors', getSectors);

// 4. Flight Search Methods (Supports GAPI POST /search/flights and GET/POST /flights/search)
router.get('/flights/search', searchFlights);
router.post('/flights/search', searchFlights);
router.post('/search/flights', searchFlights);

// 5. Flight Booking Method
router.post('/flights/book', bookFlight);

export default router;
