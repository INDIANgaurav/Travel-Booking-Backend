import express from 'express';
import { getRecentSearches, saveRecentSearch, searchFlights, searchHotels, searchBuses, checkFlightAvailability, getCalendarPrices, getFlightCities } from './search.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

// Public Inventory Search Routes
router.get('/flights', searchFlights);
router.get('/cities', getFlightCities);
router.get('/calendar-prices', getCalendarPrices);
router.post('/flights/check', checkFlightAvailability);
router.get('/hotels', searchHotels);
router.get('/buses', searchBuses);

// Protected Routes (Recent searches)
router.use(protect);

router.route('/recent')
  .get(getRecentSearches)
  .post(saveRecentSearch);

export default router;
