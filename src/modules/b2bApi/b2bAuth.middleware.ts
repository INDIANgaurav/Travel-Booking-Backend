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

const checkRateLimit = (client: any): { allowed: boolean; limit: number; remaining: number } => {
  const clientId = client._id.toString();
  const limit = client.rateLimitPerMinute || 60;
  const now = Date.now();

  const usage = rateLimitMap.get(clientId);
  if (!usage || now > usage.resetTime) {
    rateLimitMap.set(clientId, { count: 1, resetTime: now + 60000 });
    return { allowed: true, limit, remaining: limit - 1 };
  }

  if (usage.count >= limit) {
    return { allowed: false, limit, remaining: 0 };
  }

  usage.count++;
  return { allowed: true, limit, remaining: limit - usage.count };
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

    // CASE A: Token provided (GAPI / OAuth Bearer Standard)
    if (token) {
      const secret = process.env.JWT_SECRET || 'trippechalo_jwt_super_secret_key_2026';
      try {
        const decoded: any = jwt.verify(token, secret);
        const client = await B2BClient.findById(decoded.clientId);

        if (!client) {
          return res.status(401).json({
            success: false,
            error: 'Invalid session token. Client record not found.'
          });
        }

        if (client.status === 'Suspended') {
          return res.status(403).json({
            success: false,
            error: 'Your API access has been suspended. Please contact support.'
          });
        }

        // Enforce Rate Limiting
        const rateCheck = checkRateLimit(client);
        res.setHeader('X-RateLimit-Limit', rateCheck.limit);
        res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);

        if (!rateCheck.allowed) {
          return res.status(429).json({
            success: false,
            error: `Rate limit exceeded. Partner quota is ${rateCheck.limit} req/min. Please throttle your requests.`
          });
        }

        req.b2bClient = client;
        req.isLiveMode = decoded.isLive;
        return next();
      } catch (err: any) {
        return res.status(401).json({
          success: false,
          error: `Session token invalid (${err.message}). Please re-authenticate via /oauth2/tokens`
        });
      }
    }

    // CASE B: Direct API Key provided
    const apiKey = apiKeyHeader;
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide "tokenId" or "Authorization: Bearer <token>" in headers, or "x-api-key".'
      });
    }

    // Look for the key in either test or live fields
    const client = await B2BClient.findOne({
      $or: [{ testApiKey: apiKey }, { liveApiKey: apiKey }]
    });

    if (!client) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API Key.'
      });
    }

    if (client.status === 'Suspended') {
      return res.status(403).json({
        success: false,
        error: 'Your API access has been suspended. Please contact support.'
      });
    }

    const isLive = client.liveApiKey === apiKey;

    // If they use a live key but their status is not live yet
    if (isLive && client.status !== 'Live') {
      return res.status(403).json({
        success: false,
        error: 'Your account is not approved for LIVE mode yet. Please use your test key.'
      });
    }

    // IP Whitelisting Check (Optional extra security)
    const clientIp = req.ip || req.connection.remoteAddress;
    if (client.allowedIPs && client.allowedIPs.length > 0 && clientIp) {
      if (!client.allowedIPs.includes(clientIp)) {
        return res.status(403).json({
          success: false,
          error: `IP address ${clientIp} is not whitelisted for this API key.`
        });
      }
    }

    // Enforce Rate Limiting
    const rateCheck = checkRateLimit(client);
    res.setHeader('X-RateLimit-Limit', rateCheck.limit);
    res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);

    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: `Rate limit exceeded. Partner quota is ${rateCheck.limit} req/min. Please throttle your requests.`
      });
    }

    // Attach to request
    req.b2bClient = client;
    req.isLiveMode = isLive;

    next();
  } catch (error) {
    console.error('B2B Auth Error:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error during Authentication' });
  }
};
