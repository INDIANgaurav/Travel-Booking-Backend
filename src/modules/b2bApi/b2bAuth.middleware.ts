import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import B2BClient from './b2bClient.model';

// Extend Express Request to hold the B2B Client info
declare global {
  namespace Express {
    interface Request {
      b2bClient?: any;
      isLiveMode?: boolean;
    }
  }
}

// In-memory partner rate limiting tracker: clientId -> { count, resetTime }
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Periodic garbage collection every 10 minutes for inactive clients
setInterval(() => {
  const now = Date.now();
  for (const [clientId, usage] of rateLimitMap.entries()) {
    if (now > usage.resetTime) {
      rateLimitMap.delete(clientId);
    }
  }
}, 10 * 60 * 1000);

const checkRateLimit = (client: any): { allowed: boolean; limit: number; remaining: number; resetTime: number } => {
  const clientId = client._id.toString();
  const limit = client.rateLimitPerMinute || 60;
  const now = Date.now();

  const usage = rateLimitMap.get(clientId);
  if (!usage || now > usage.resetTime) {
    const resetTime = now + 60000;
    rateLimitMap.set(clientId, { count: 1, resetTime });
    return { allowed: true, limit, remaining: limit - 1, resetTime };
  }

  if (usage.count >= limit) {
    return { allowed: false, limit, remaining: 0, resetTime: usage.resetTime };
  }

  usage.count++;
  return { allowed: true, limit, remaining: limit - usage.count, resetTime: usage.resetTime };
};

export const protectB2BApi = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tokenHeader = req.header('tokenId') || req.header('token') || (req.query.tokenId as string) || (req.query.token as string);
    const authHeader = req.header('authorization');
    const apiKeyHeader = req.header('x-api-key') || (req.query.apiKey as string) || (req.query['x-api-key'] as string);

    let token = tokenHeader;
    if (!token && authHeader) {
      token = authHeader;
    }

    if (token) {
      token = token.replace(/Bearer\s+/gi, '').replace(/^["']|["']$/g, '').trim();
    }

    // Helper for error envelope
    const sendAuthError = (status: number, code: string, message: string) => {
      return res.status(status).json({
        success: false,
        statusCode: status,
        error: {
          code,
          message
        },
        meta: {
          timestamp: new Date().toISOString()
        }
      });
    };

    // CASE A: Token provided (GAPI / OAuth Bearer Standard)
    if (token) {
      const secret = process.env.JWT_SECRET || 'trippechalo_jwt_super_secret_key_2026';
      try {
        const decoded: any = jwt.verify(token, secret);
        const client = await B2BClient.findById(decoded.clientId);

        if (!client) {
          return sendAuthError(401, 'UNAUTHORIZED', 'Invalid session token. Client record not found.');
        }

        if (client.status === 'Suspended') {
          return sendAuthError(403, 'ACCOUNT_SUSPENDED', 'Your API access has been suspended. Please contact technical support.');
        }

        // Enforce Rate Limiting
        const rateCheck = checkRateLimit(client);
        res.setHeader('X-RateLimit-Limit', rateCheck.limit);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, rateCheck.remaining));
        res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetTime / 1000));

        if (!rateCheck.allowed) {
          const retryAfterSec = Math.max(1, Math.ceil((rateCheck.resetTime - Date.now()) / 1000));
          res.setHeader('Retry-After', retryAfterSec);
          return res.status(429).json({
            success: false,
            statusCode: 429,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: `Rate limit of ${rateCheck.limit} req/min exceeded. Please throttle your requests and retry after ${retryAfterSec}s.`,
              details: [{ limit: rateCheck.limit, retryAfterSeconds: retryAfterSec }]
            },
            meta: {
              timestamp: new Date().toISOString()
            }
          });
        }

        req.b2bClient = client;
        req.isLiveMode = Boolean(decoded.isLive);
        return next();
      } catch (err: any) {
        return sendAuthError(401, 'INVALID_TOKEN', `Session token invalid (${err.message}). Please re-authenticate via /oauth2/tokens`);
      }
    }

    // CASE B: Direct API Key provided
    const apiKey = apiKeyHeader;
    if (!apiKey) {
      return sendAuthError(
        401,
        'UNAUTHORIZED',
        'Authentication required. Please provide "Authorization: Bearer <token>" or "x-api-key" in headers.'
      );
    }

    // Look for the key in either test or live fields
    const client = await B2BClient.findOne({
      $or: [{ testApiKey: apiKey }, { liveApiKey: apiKey }]
    });

    if (!client) {
      return sendAuthError(401, 'INVALID_API_KEY', 'The provided API Key is invalid or not registered.');
    }

    if (client.status === 'Suspended') {
      return sendAuthError(403, 'ACCOUNT_SUSPENDED', 'Your API access has been suspended. Please contact technical support.');
    }

    const isLive = client.liveApiKey === apiKey;

    // If they use a live key but their status is not live yet
    if (isLive && client.status !== 'Live') {
      return sendAuthError(
        403,
        'SANDBOX_ONLY',
        'Your account is in Testing status. Please use your Sandbox API key or contact support for live activation.'
      );
    }

    // IP Whitelisting Check
    const clientIp = req.ip || req.connection.remoteAddress;
    if (client.allowedIPs && client.allowedIPs.length > 0 && clientIp) {
      if (!client.allowedIPs.includes(clientIp)) {
        return sendAuthError(403, 'IP_NOT_WHITELISTED', `IP address ${clientIp} is not whitelisted for this API key.`);
      }
    }

    // Enforce Rate Limiting
    const rateCheck = checkRateLimit(client);
    res.setHeader('X-RateLimit-Limit', rateCheck.limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, rateCheck.remaining));
    res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetTime / 1000));

    if (!rateCheck.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil((rateCheck.resetTime - Date.now()) / 1000));
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        success: false,
        statusCode: 429,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit of ${rateCheck.limit} req/min exceeded. Please throttle your requests and retry after ${retryAfterSec}s.`,
          details: [{ limit: rateCheck.limit, retryAfterSeconds: retryAfterSec }]
        },
        meta: {
          timestamp: new Date().toISOString()
        }
      });
    }

    // Attach to request
    req.b2bClient = client;
    req.isLiveMode = isLive;

    next();
  } catch (error: any) {
    console.error('B2B Auth Error:', error);
    res.status(500).json({
      success: false,
      statusCode: 500,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Internal Server Error during Authentication'
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  }
};
