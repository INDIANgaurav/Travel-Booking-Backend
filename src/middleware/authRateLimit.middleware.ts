import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import AuthRateLimit from '../modules/auth/authRateLimit.model';

const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // Full 15 minutes from user's first attempt
const LOGIN_FAIL_EMAIL_MAX = 5;
const LOGIN_FAIL_IP_SPRAY_MAX = 50;

interface BucketState {
  count: number;
  resetAt: Date;
}

export interface RateLimitRule {
  key: string;
  max: number;
}

const memoryFallbackStore = new Map<string, BucketState>();

const normalizeIp = (req: Request): string => {
  const raw = req.ip || req.socket?.remoteAddress || 'unknown';
  return raw.replace(/^::ffff:/, '').trim() || 'unknown';
};

export const normalizeEmailKey = (email: unknown): string | null => {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed ? trimmed : null;
};

const pruneMemoryFallback = () => {
  if (memoryFallbackStore.size < 2000) return;
  const now = Date.now();
  for (const [k, v] of memoryFallbackStore.entries()) {
    if (v.resetAt.getTime() <= now) {
      memoryFallbackStore.delete(k);
    }
  }
};

/**
 * Atomically increments a rolling per-key window starting from the caller's first attempt.
 * Persists in MongoDB so server restarts do not reset active blocks.
 */
async function incrementWindow(key: string, windowMs: number): Promise<BucketState> {
  const now = new Date();
  const nextResetAt = new Date(now.getTime() + windowMs);

  if (mongoose.connection.readyState === 1) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await AuthRateLimit.deleteOne({ key, resetAt: { $lte: now } });
        const doc = await AuthRateLimit.findOneAndUpdate(
          { key },
          {
            $inc: { count: 1 },
            $setOnInsert: { key, resetAt: nextResetAt },
          },
          { upsert: true, new: true }
        ).lean();

        if (doc) {
          return { count: doc.count, resetAt: new Date(doc.resetAt) };
        }
      } catch (err: any) {
        if (err?.code === 11000 && attempt === 0) {
          continue;
        }
        throw err;
      }
    }
  }

  pruneMemoryFallback();
  const existing = memoryFallbackStore.get(key);
  if (existing && existing.resetAt.getTime() > now.getTime()) {
    existing.count += 1;
    return existing;
  }

  const created = { count: 1, resetAt: nextResetAt };
  memoryFallbackStore.set(key, created);
  return created;
}

async function readActiveWindow(key: string): Promise<BucketState | null> {
  const now = new Date();

  if (mongoose.connection.readyState === 1) {
    const doc = await AuthRateLimit.findOne({ key, resetAt: { $gt: now } }).lean();
    return doc ? { count: doc.count, resetAt: new Date(doc.resetAt) } : null;
  }

  const existing = memoryFallbackStore.get(key);
  if (existing && existing.resetAt.getTime() > now.getTime()) {
    return existing;
  }
  return null;
}

async function clearWindow(key: string): Promise<void> {
  memoryFallbackStore.delete(key);
  if (mongoose.connection.readyState === 1) {
    await AuthRateLimit.deleteOne({ key });
  }
}

const buildRetrySeconds = (resetAt: Date): number =>
  Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));

interface PersistentLimiterOptions {
  prefix: string;
  windowMs?: number;
  message: string;
  getRules: (req: Request, ip: string) => RateLimitRule[];
}

/**
 * Express middleware evaluating independent per-account and shared-IP limits.
 * Using separate thresholds prevents one user's typos from blocking coworkers/users on shared Wi-Fi.
 */
export function createPersistentAuthLimiter(options: PersistentLimiterOptions) {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = normalizeIp(req);
      const rules = options.getRules(req, ip).filter((r) => Boolean(r.key));
      if (rules.length === 0) return next();

      const results = await Promise.all(
        rules.map(async (rule) => ({
          rule,
          state: await incrementWindow(`${options.prefix}:${rule.key}`, windowMs),
        }))
      );

      // Pick tightest remaining quota to report accurately in headers
      const violated = results.find((r) => r.state.count > r.rule.max);
      const primary = violated || results.reduce((tightest, curr) => {
        const currRem = curr.rule.max - curr.state.count;
        const tightRem = tightest.rule.max - tightest.state.count;
        return currRem < tightRem ? curr : tightest;
      });

      const remaining = Math.max(0, primary.rule.max - primary.state.count);
      const retryAfterSeconds = buildRetrySeconds(primary.state.resetAt);

      res.setHeader('RateLimit-Limit', String(primary.rule.max));
      res.setHeader('RateLimit-Remaining', String(remaining));
      res.setHeader('RateLimit-Reset', String(retryAfterSeconds));

      if (violated) {
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          message: options.message,
          retryAfterSeconds,
        });
      }

      return next();
    } catch (err) {
      console.error('Auth rate limiter error:', err);
      return next();
    }
  };
}

const getLoginFailRules = (req: Request, email?: unknown): RateLimitRule[] => {
  const ip = normalizeIp(req);
  const normalizedEmail = normalizeEmailKey(email);

  if (normalizedEmail) {
    return [
      { key: `login-fail:email:${normalizedEmail}`, max: LOGIN_FAIL_EMAIL_MAX },
      { key: `login-fail:ip:${ip}`, max: LOGIN_FAIL_IP_SPRAY_MAX },
    ];
  }

  return [{ key: `login-fail:ip-anon:${ip}`, max: LOGIN_FAIL_EMAIL_MAX }];
};

/**
 * Checks whether the target email (max 5 failures) or spraying IP (max 50 failures) is locked.
 */
export async function checkLoginFailureLock(
  req: Request,
  email?: unknown
): Promise<{ locked: boolean; retryAfterSeconds: number; message?: string }> {
  const rules = getLoginFailRules(req, email);
  const buckets = await Promise.all(rules.map((r) => readActiveWindow(r.key)));

  for (let i = 0; i < rules.length; i++) {
    const bucket = buckets[i];
    if (bucket && bucket.count >= rules[i].max) {
      const retryAfterSeconds = buildRetrySeconds(bucket.resetAt);
      const waitMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
      return {
        locked: true,
        retryAfterSeconds,
        message: `Too many failed login attempts. Please try again in ${waitMinutes} minute(s).`,
      };
    }
  }

  return { locked: false, retryAfterSeconds: 0 };
}

/**
 * Records a failed login attempt against the target email and IP spray guard.
 */
export async function recordLoginFailure(req: Request, email?: unknown): Promise<void> {
  const rules = getLoginFailRules(req, email);
  await Promise.all(rules.map((r) => incrementWindow(r.key, DEFAULT_WINDOW_MS)));
}

/**
 * Clears only the per-email failure counter on valid login (keeps IP spray counter intact).
 */
export async function clearLoginFailures(_req: Request, email?: unknown): Promise<void> {
  const normalizedEmail = normalizeEmailKey(email);
  if (normalizedEmail) {
    await clearWindow(`login-fail:email:${normalizedEmail}`);
  }
}
