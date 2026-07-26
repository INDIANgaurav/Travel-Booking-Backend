import express from 'express';
import { registerUser, registerAgent, loginUser, forgotPassword, resetPassword, googleAuth } from './auth.controller';

const router = express.Router();

router.post('/register', registerUser);
router.post('/register-agent', registerAgent);
router.post('/login', loginUser);
router.post('/google', googleAuth);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:resettoken', resetPassword);

export default router;
