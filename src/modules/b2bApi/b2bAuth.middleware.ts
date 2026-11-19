import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import B2BClient from './b2bClient.model';
import B2BRateLimit from './b2bRateLimit.model';
import { getB2BJwtSecret } from './b2bValidators';

declare global {
  namespace Express {
    interface Request {
      b2bClient?: any;
      isLiveMode?: boolean;
    }
  }
}

type RateBucketScope = 'token' | 'search' | 'booking' | 'default';

const BUCKET_WINDOW_MS = 60 * 1000; // 1-minute atomic fixed time bucket
const memoryFallback = new Map<string, { count: number; resetAt: Date }>();

export const normalizeClientIp = (req: Request): string => {
  const raw = req.ip || req.socket?.remoteAddress || 'unknown';
  return raw.replace(/^::ffff:/, '').trim() || 'unknown';
};

const sendAuthError = (res: Response, status: number, code: string, message: string, details?: any[]) => {
  return res.status(status).json({
    success: false,
    statusCode: status,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
};

const resolveEndpointScope = (req: Request): RateBucketScope => {
  const path = `${req.baseUrl}${req.path}`.toLowerCase();
  if (path.includes('/flights/book')) return 'booking';
  if (path.includes('/search') || path.includes('/sectors')) return 'search';
  if (path.includes('/oauth2/tokens') || path.includes('/auth/token')) return 'token';
  return 'default';
};

const resolveLimitForScope = (client: any, scope: RateBucketScope): number => {
  if (scope === 'booking') return Number(client.bookingRateLimitPerMinute) || 30;
  if (scope === 'search') return Number(client.searchRateLimitPerMinute) || Math.max(Number(client.rateLimitPerMinute) || 60, 300);
  if (scope === 'token') return Number(client.tokenRateLimitPerMinute) || 10;
  return Number(client.rateLimitPerMinute) || 60;
};

/**
 * Single-document atomic counter + time-bucket limiter stored in MongoDB (no Redis).
 * TTL index automatically sweeps expired bucket documents.
 */
async function incrementAtomicRateBucket(
  scope: RateBucketScope,
  identifier: string,
  limit: number
): Promise<{ allowed: boolean; limit: number; remaining: number; resetAt: Date }> {
  const nowMs = Date.now();
  const bucket = Math.floor(nowMs / BUCKET_WINDOW_MS);
  const resetAt = new Date((bucket + 1) * BUCKET_WINDOW_MS);
  const scopedKey = `b2b:${scope}:${identifier}:${bucket}`;

  if (mongoose.connection.readyState === 1) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const doc = await B2BRateLimit.findOneAndUpdate(
          { key: scopedKey },
          {
            $inc: { count: 1 },
            $setOnInsert: { key: scopedKey, resetAt },
          },
          { upsert: true, new: true }
        ).lean();

        const count = doc?.count || 1;
        return {
          allowed: count <= limit,
          limit,
          remaining: Math.max(0, limit - count),
          resetAt,
        };
      } catch (err: any) {
        if (err?.code === 11000 && attempt === 0) continue;
        throw err;
      }
    }
  }

  // Fallback only when MongoDB is disconnected
  const existing = memoryFallback.get(scopedKey);
  if (existing && existing.resetAt.getTime() > nowMs) {
    existing.count += 1;
    return {
      allowed: existing.count <= limit,
      limit,
      remaining: Math.max(0, limit - existing.count),
      resetAt: existing.resetAt,
    };
  }

  memoryFallback.set(scopedKey, { count: 1, resetAt });
  return { allowed: true, limit, remaining: Math.max(0, limit - 1), resetAt };
}

async function applyPartnerRateLimit(req: Request, res: Response, client: any): Promise<boolean> {
  const scope = resolveEndpointScope(req);
  const limit = resolveLimitForScope(client, scope);
  const result = await incrementAtomicRateBucket(scope, client._id.toString(), limit);
  const retryAfterSec = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));

  res.setHeader('X-RateLimit-Limit', String(result.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt.getTime() / 1000)));
  res.setHeader('X-RateLimit-Scope', scope);

  if (!result.allowed) {
    res.setHeader('Retry-After', String(retryAfterSec));
    sendAuthError(
      res,
      429,
      'RATE_LIMIT_EXCEEDED',
      `Rate limit of ${result.limit} req/min for ${scope} exceeded. Please retry after ${retryAfterSec}s.`,
      [{ scope, limit: result.limit, retryAfterSeconds: retryAfterSec }]
    );
    return false;
  }

  return true;
}

/**
 * Brute-force rate limiter for token issuance endpoints (/oauth2/tokens & /auth/token).
 */
export const b2bTokenRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = normalizeClientIp(req);
    const ipLimit = 10;
    const result = await incrementAtomicRateBucket('token', `ip:${ip}`, ipLimit);
    const retryAfterSec = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));

    res.setHeader('X-RateLimit-Limit', String(result.limit));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt.getTime() / 1000)));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(retryAfterSec));
      return sendAuthError(
        res,
        429,
        'RATE_LIMIT_EXCEEDED',
        `Too many token requests from IP ${ip}. Please retry after ${retryAfterSec}s.`,
        [{ limit: result.limit, retryAfterSeconds: retryAfterSec }]
      );
    }

    return next();
  } catch (err) {
    console.error('B2B token rate limit error:', err);
    return next();
  }
};

/**
 * Shared authorization pipeline executed identically for both JWT Bearer and x-api-key auth:
 * Status check -> Environment check -> IP Allowlist -> Persistent Rate Limit.
 */
async function authorizePartnerRequest(
  req: Request,
  res: Response,
  client: any,
  isLiveMode: boolean
): Promise<boolean> {
  if (client.status === 'Suspended') {
    sendAuthError(res, 403, 'ACCOUNT_SUSPENDED', 'Your API access has been suspended. Please contact technical support.');
    return false;
  }

  if (client.status === 'Pending' || (client.status !== 'Testing' && client.status !== 'Live')) {
    sendAuthError(res, 403, 'PARTNER_NOT_ACTIVE', 'Your partner account is pending activation and cannot access the API yet.');
    return false;
  }

  if (isLiveMode && client.status !== 'Live') {
    sendAuthError(
      res,
      403,
      'ENVIRONMENT_MISMATCH',
      'Live production credentials cannot be used while partner account is in Testing status.'
    );
    return false;
  }

  const clientIp = normalizeClientIp(req);
  if (Array.isArray(client.allowedIPs) && client.allowedIPs.length > 0) {
    const normalizedAllowed = client.allowedIPs.map((ip: string) => ip.replace(/^::ffff:/, '').trim());
    if (!normalizedAllowed.includes(clientIp)) {
      sendAuthError(res, 403, 'IP_NOT_WHITELISTED', `IP address ${clientIp} is not whitelisted for this partner account.`);
      return false;
    }
  }

  const withinRate = await applyPartnerRateLimit(req, res, client);
  if (!withinRate) return false;

  req.b2bClient = client;
  req.isLiveMode = isLiveMode;
  return true;
}

export const protectB2BApi = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Reject credentials supplied in URL query parameters to prevent log leakage
    if (req.query.token || req.query.tokenId || req.query.apiKey || req.query['x-api-key']) {
      return sendAuthError(
        res,
        401,
        'QUERY_CREDENTIALS_NOT_ALLOWED',
        'Passing API keys or tokens in URL query parameters is disabled. Use Authorization or x-api-key headers.'
      );
    }

    const tokenHeader = req.header('tokenId') || req.header('token');
    const authHeader = req.header('authorization');
    const apiKeyHeader = req.header('x-api-key');

    let token = tokenHeader || (authHeader && /^Bearer\s+/i.test(authHeader) ? authHeader : '');
    if (token) {
      token = token.replace(/Bearer\s+/gi, '').replace(/^["']|["']$/g, '').trim();
    }

    // MODE A: Bearer JWT Authentication
    if (token) {
      const secret = getB2BJwtSecret();
      try {
        const decoded: any = jwt.verify(token, secret, {
          algorithms: ['HS256'],
          issuer: 'trippechalo-auth',
          audience: 'trippechalo-b2b-api',
        });

        const client = await B2BClient.findById(decoded.clientId);
        if (!client) {
          return sendAuthError(res, 401, 'UNAUTHORIZED', 'Invalid session token. Client record not found.');
        }

        if ((decoded.tokenVersion ?? 0) !== (client.tokenVersion ?? 0)) {
          return sendAuthError(res, 401, 'TOKEN_REVOKED', 'Session token has been revoked. Please generate a new token.');
        }

        const isLive = decoded.env ? decoded.env === 'PRODUCTION' : Boolean(decoded.isLive);
        const ok = await authorizePartnerRequest(req, res, client, isLive);
        if (!ok) return;

        return next();
      } catch (err: any) {
        return sendAuthError(res, 401, 'INVALID_TOKEN', `Session token invalid (${err.message}). Please re-authenticate via /oauth2/tokens`);
      }
    }

    // MODE B: Direct API Key Header Authentication
    if (!apiKeyHeader) {
      return sendAuthError(
        res,
        401,
        'UNAUTHORIZED',
        'Authentication required. Please provide "Authorization: Bearer <token>" or "x-api-key" header.'
      );
    }

    const client = await B2BClient.findOne({
      $or: [{ testApiKey: apiKeyHeader }, { liveApiKey: apiKeyHeader }],
    });

    if (!client) {
      return sendAuthError(res, 401, 'INVALID_API_KEY', 'The provided API Key is invalid or not registered.');
    }

    const isLive = client.liveApiKey === apiKeyHeader;
    const ok = await authorizePartnerRequest(req, res, client, isLive);
    if (!ok) return;

    return next();
  } catch (error: any) {
    console.error('B2B Auth Error:', error);
    return sendAuthError(res, 500, 'INTERNAL_SERVER_ERROR', error.message || 'Internal Server Error during Authentication');
  }
};
