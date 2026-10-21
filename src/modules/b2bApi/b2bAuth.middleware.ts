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

export const protectB2BApi = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tokenHeader = req.header('tokenId') || req.header('token');
    const authHeader = req.header('authorization');
    const apiKeyHeader = req.header('x-api-key');

    let token = tokenHeader;
    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
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

        req.b2bClient = client;
        req.isLiveMode = decoded.isLive;
        return next();
      } catch (err: any) {
        return res.status(401).json({
          success: false,
          error: 'Session token expired or invalid. Please re-authenticate via /auth/token'
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

    // Attach to request
    req.b2bClient = client;
    req.isLiveMode = isLive;

    next();
  } catch (error) {
    console.error('B2B Auth Error:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error during Authentication' });
  }
};
