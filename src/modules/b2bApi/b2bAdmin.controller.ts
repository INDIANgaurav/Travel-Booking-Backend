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

    if (!companyName || !contactName || !email) {
      return res.status(400).json({ success: false, error: 'Company Name, Contact Name, and Email are required.' });
    }

    // Check if email already exists
    const existingClient = await B2BClient.findOne({ email });
    if (existingClient) {
      return res.status(400).json({ success: false, error: 'A B2B partner with this email already exists.' });
    }

    const testApiKey = generateApiKey('test_tc');
    const liveApiKey = generateApiKey('live_tc');

    const newClient = await B2BClient.create({
      companyName,
      contactName,
      email,
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
