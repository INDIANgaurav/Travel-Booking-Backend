import express from 'express';
import { registerUser, registerAgent, loginUser, forgotPassword, resetPassword, googleAuth, verifyRegistration } from './auth.controller';

const router = express.Router();

router.post('/register', registerUser);
router.post('/register-agent', registerAgent);
router.post('/verify-registration', verifyRegistration);
router.post('/login', loginUser);
router.post('/google', googleAuth);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;
