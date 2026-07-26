import express from 'express';
import { getAccountStatement } from './accountStatement.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();

router.get('/', protect, getAccountStatement);

export default router;
