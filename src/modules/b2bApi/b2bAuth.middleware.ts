import { Request, Response, NextFunction } from 'express';
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
    const apiKey = req.header('x-api-key');

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API Key is missing. Please provide x-api-key in headers.'
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
      // In production behind proxies, you'd check x-forwarded-for
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
