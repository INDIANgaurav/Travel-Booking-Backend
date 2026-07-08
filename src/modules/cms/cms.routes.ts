import express from 'express';
import { getCMSDestinations, getOffers } from './cms.controller';

const router = express.Router();

router.get('/destinations', getCMSDestinations);
router.get('/offers', getOffers);

export default router;
