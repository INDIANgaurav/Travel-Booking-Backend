import express from 'express';
import {
  authenticateB2BClient,
  getSectors,
  searchFlights,
  bookFlight,
  getBookingDetails,
  getCancellationPolicy,
  getPartnerStatus,
  getPartnerWalletBalance,
  getPartnerWalletTransactions,
  getOpenApiDoc,
  getPostmanDoc
} from './b2bApi.controller';
import { protectB2BApi, b2bTokenRateLimiter } from './b2bAuth.middleware';

const router = express.Router();

// 1. Public OpenAPI 3.1 & Postman 2.1 Specification Endpoints
router.get('/docs/openapi.json', getOpenApiDoc);
router.get('/openapi.json', getOpenApiDoc);
router.get('/docs/postman.json', getPostmanDoc);
router.get('/postman.json', getPostmanDoc);

// 2. Authentication Endpoints (Brute-force rate limited via MongoDB atomic buckets)
router.post('/oauth2/tokens', b2bTokenRateLimiter, authenticateB2BClient);
router.post('/auth/token', b2bTokenRateLimiter, authenticateB2BClient);

// 3. Protect all subsequent B2B endpoints (requires tokenId / Bearer token or x-api-key)
router.use(protectB2BApi);

// 4. Partner Gateway Ping & Status Endpoints
router.get('/status', getPartnerStatus);
router.get('/ping', getPartnerStatus);

// 5. Partner Wallet Balance & Transaction Ledger Endpoints
router.get('/wallet/balance', getPartnerWalletBalance);
router.get('/wallet/transactions', getPartnerWalletTransactions);

// 6. Flight Sector Methods (GAPI /search/sectors & /flights/sectors)
router.get('/search/sectors', getSectors);
router.get('/flights/sectors', getSectors);

// 7. Flight Search Methods (Supports GAPI POST /search/flights and GET/POST /flights/search)
router.get('/flights/search', searchFlights);
router.post('/flights/search', searchFlights);
router.post('/search/flights', searchFlights);

// 8. Flight Booking Method (with Idempotency-Key & Atomic CAS)
router.post('/flights/book', bookFlight);

// 9. Booking Retrieve Endpoints (supports singular /booking and plural /bookings by bookingId or ?pnr=)
router.get('/flights/booking/:bookingId', getBookingDetails);
router.get('/flights/booking', getBookingDetails);
router.get('/flights/bookings/:bookingId', getBookingDetails);
router.get('/flights/bookings', getBookingDetails);

// 10. Cancellation & Fare Rules Policy Endpoint
router.get('/flights/cancellation-policy', getCancellationPolicy);

export default router;
