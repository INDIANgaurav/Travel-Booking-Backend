import express, { Request } from 'express';
import { registerUser, registerAgent, loginUser, forgotPassword, resetPassword, googleAuth, verifyRegistration, refreshAccessToken, logoutUser } from './auth.controller';
import { createPersistentAuthLimiter, normalizeEmailKey, RateLimitRule } from '../../middleware/authRateLimit.middleware';

const router = express.Router();

const SHARED_IP_SAFE_MAX = 30;

const buildIdentifierRules = (req: Request, ip: string): RateLimitRule[] => {
  const rules: RateLimitRule[] = [{ key: `ip:${ip}`, max: SHARED_IP_SAFE_MAX }];
  const email = normalizeEmailKey(req.body?.email);
  const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';

  if (email) rules.push({ key: `email:${email}`, max: 5 });
  if (userId) rules.push({ key: `user:${userId}`, max: 5 });
  if (!email && !userId) rules.push({ key: `ip-anon:${ip}`, max: 5 });

  return rules;
};

// High IP cap prevents shared office/CGNAT lockouts; 5-fail account lock is enforced in loginUser
const loginIpLimiter = createPersistentAuthLimiter({
  prefix: 'auth:login',
  getRules: (_req, ip) => [{ key: `ip:${ip}`, max: 100 }],
  message: 'Too many login requests from this network. Please try again after 15 minutes.',
});

const registerLimiter = createPersistentAuthLimiter({
  prefix: 'auth:register',
  getRules: buildIdentifierRules,
  message: 'Too many registration attempts. Please try again after 15 minutes.',
});

const otpLimiter = createPersistentAuthLimiter({
  prefix: 'auth:otp',
  getRules: buildIdentifierRules,
  message: 'Too many verification or password-reset attempts. Please try again after 15 minutes.',
});

const oauthLimiter = createPersistentAuthLimiter({
  prefix: 'auth:oauth',
  getRules: (_req, ip) => [{ key: `ip:${ip}`, max: SHARED_IP_SAFE_MAX }],
  message: 'Too many Google sign-in attempts. Please try again after 15 minutes.',
});

const refreshLimiter = createPersistentAuthLimiter({
  prefix: 'auth:refresh',
  getRules: (_req, ip) => [{ key: `ip:${ip}`, max: 60 }],
  message: 'Too many token refresh requests. Please log in again later.',
});

router.post('/register', registerLimiter, registerUser);
router.post('/register-agent', registerLimiter, registerAgent);
router.post('/verify-registration', otpLimiter, verifyRegistration);
router.post('/login', loginIpLimiter, loginUser);
router.post('/google', oauthLimiter, googleAuth);
router.post('/forgot-password', otpLimiter, forgotPassword);
router.post('/reset-password', otpLimiter, resetPassword);
router.post('/refresh', refreshLimiter, refreshAccessToken);
router.post('/logout', logoutUser);

export default router;
