import express from 'express';
import {
  authenticateB2BClient,
  getSectors,
  searchFlights,
  bookFlight,
  getBookingDetails,
  getCancellationPolicy,
  getOpenApiDoc,
  getPostmanDoc
} from './b2bApi.controller';
import { protectB2BApi } from './b2bAuth.middleware';

const router = express.Router();

// 1. Public OpenAPI 3.1 & Postman 2.1 Specification Endpoints
router.get('/docs/openapi.json', getOpenApiDoc);
router.get('/openapi.json', getOpenApiDoc);
router.get('/docs/postman.json', getPostmanDoc);
router.get('/postman.json', getPostmanDoc);

// 2. Authentication Endpoints (Exact GAPI OAuth2 path & standard auth path)
router.post('/oauth2/tokens', authenticateB2BClient);
router.post('/auth/token', authenticateB2BClient);

// 3. Protect all subsequent B2B endpoints (requires tokenId / Bearer token or x-api-key)
router.use(protectB2BApi);

// 4. Flight Sector Methods (GAPI /search/sectors & /flights/sectors)
router.get('/search/sectors', getSectors);
router.get('/flights/sectors', getSectors);

// 5. Flight Search Methods (Supports GAPI POST /search/flights and GET/POST /flights/search)
router.get('/flights/search', searchFlights);
router.post('/flights/search', searchFlights);
router.post('/search/flights', searchFlights);

// 6. Flight Booking Method (with Idempotency-Key & Atomic CAS)
router.post('/flights/book', bookFlight);

// 7. Booking Retrieve Endpoints (by bookingId or ?pnr=)
router.get('/flights/booking/:bookingId', getBookingDetails);
router.get('/flights/booking', getBookingDetails);

// 8. Cancellation & Fare Rules Policy Endpoint
router.get('/flights/cancellation-policy', getCancellationPolicy);

export default router;
