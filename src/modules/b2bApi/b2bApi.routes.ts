import express from 'express';
import { searchFlights, bookFlight } from './b2bApi.controller';
import { protectB2BApi } from './b2bAuth.middleware';

const router = express.Router();

// Apply API Key security to all B2B routes
router.use(protectB2BApi);

router.get('/flights/search', searchFlights);
router.post('/flights/book', bookFlight);

export default router;
