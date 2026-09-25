import express from 'express';
import { getCMSDestinations, getOffers, getGlobeStats } from './cms.controller';

const router = express.Router();

router.get('/destinations', getCMSDestinations);
router.get('/offers', getOffers);
router.get('/globe-stats', getGlobeStats);

export default router;
