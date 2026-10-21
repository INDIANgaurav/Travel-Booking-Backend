import { Request, Response } from 'express';
import crypto from 'crypto';
import B2BClient from './b2bClient.model';

// Helper to generate secure API keys
const generateApiKey = (prefix: string) => {
  const token = crypto.randomBytes(32).toString('hex');
  return `${prefix}_${token}`;
};

export const createB2BClient = async (req: Request, res: Response) => {
  try {
    const { companyName, contactName, email, status, rateLimitPerMinute, markupPercentage } = req.body;

    const testApiKey = generateApiKey('test_tc');
    const liveApiKey = generateApiKey('live_tc');

    const clientUsername = req.body.username || `TC${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const clientPassword = req.body.password || `Tc#${crypto.randomBytes(4).toString('hex')}!`;
    const authChannel = req.body.auth_channel || 'cugtest.trippechalo.com';
    const basicAuthKey = Buffer.from(`${clientUsername}:${clientPassword}`).toString('base64');

    // Smart fallbacks: ANY 1, ANY 2, or NONE of the 3 can be provided!
    const finalCompany = (companyName || contactName || (email ? email.split('@')[0] : '') || `B2B Partner ${clientUsername.slice(-4)}`).trim();
    const finalContact = (contactName || companyName || 'Partner Admin').trim();
    const finalEmail = (email || `${clientUsername.toLowerCase()}@partner.trippechalo.com`).toLowerCase().trim();

    // Check if real email already exists
    if (email) {
      const existingClient = await B2BClient.findOne({ email: finalEmail });
      if (existingClient) {
        return res.status(400).json({ success: false, error: 'A B2B partner with this email already exists.' });
      }
    }

    const newClient = await B2BClient.create({
      companyName: finalCompany,
      contactName: finalContact,
      email: finalEmail,
      username: clientUsername,
      password: clientPassword,
      basicAuthKey,
      auth_channel: authChannel,
      testApiKey,
      liveApiKey,
      status: status || 'Testing',
      rateLimitPerMinute: rateLimitPerMinute || 60,
      markupPercentage: markupPercentage || 0,
      apiWalletBalance: 0
    });

    res.status(201).json({ success: true, data: newClient });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getB2BClients = async (req: Request, res: Response) => {
  try {
    const clients = await B2BClient.find().sort({ createdAt: -1 });
    res.json({ success: true, data: clients });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateB2BClient = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, rateLimitPerMinute, markupPercentage } = req.body;

    const client = await B2BClient.findByIdAndUpdate(
      id,
      { $set: { status, rateLimitPerMinute, markupPercentage } },
      { new: true }
    );

    if (!client) {
      return res.status(404).json({ success: false, error: 'B2B Client not found' });
    }

    res.json({ success: true, data: client });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
