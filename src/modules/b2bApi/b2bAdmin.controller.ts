import { Request, Response } from 'express';
import crypto from 'crypto';
import B2BClient from './b2bClient.model';
import Booking from '../bookings/booking.model';
import User from '../users/user.model';

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

    // Generate SIMPLE, readable credentials
    // Username: lowercase company slug + 4 random digits (e.g. mmt_2847, skyline_9301)
    // Password: Capitalized short + @ + 4 random digits (e.g. Mmt@2847, Sky@9301)
    const companySlug = (companyName || contactName || 'partner')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 10);
    const randomPin = Math.floor(1000 + Math.random() * 9000); // 4-digit pin

    const clientUsername = req.body.username || `${companySlug}_${randomPin}`;
    const clientPassword = req.body.password || `${companySlug.charAt(0).toUpperCase()}${companySlug.slice(1, 4)}@${randomPin}`;
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
    const clients = await B2BClient.find().sort({ createdAt: -1 }).lean();

    // Map partner user accounts by email for comprehensive booking query
    const clientEmails = clients.map(c => c.email ? c.email.toLowerCase().trim() : '').filter(Boolean);
    const users = await User.find({ email: { $in: clientEmails } }).select('_id email').lean();
    const emailToUserId = new Map(users.map(u => [u.email.toLowerCase().trim(), u._id]));

    const clientsWithStats = await Promise.all(
      clients.map(async (client) => {
        const userId = client.email ? emailToUserId.get(client.email.toLowerCase().trim()) : null;
        const query: any = {
          $or: [
            { 'details.b2bClientId': client._id },
            ...(userId ? [{ user: userId }] : [])
          ]
        };

        const [totalBookings, testBookings, liveBookings] = await Promise.all([
          Booking.countDocuments(query),
          Booking.countDocuments({
            ...query,
            $or: [{ isTestBooking: true }, { 'details.isTestBooking': true }]
          }),
          Booking.countDocuments({
            ...query,
            isTestBooking: { $ne: true },
            'details.isTestBooking': { $ne: true }
          })
        ]);

        return {
          ...client,
          totalBookings,
          testBookings,
          liveBookings
        };
      })
    );

    res.json({ success: true, data: clientsWithStats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateB2BClient = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      companyName, 
      contactName, 
      email, 
      username, 
      password, 
      status, 
      isVerified,
      rateLimitPerMinute, 
      markupPercentage,
      apiWalletBalance 
    } = req.body;

    const currentClient = await B2BClient.findById(id);
    if (!currentClient) {
      return res.status(404).json({ success: false, error: 'B2B Client not found' });
    }

    // Check if new email is taken by another client
    if (email && email.toLowerCase().trim() !== currentClient.email.toLowerCase().trim()) {
      const emailConflict = await B2BClient.findOne({ 
        email: email.toLowerCase().trim(), 
        _id: { $ne: id } 
      });
      if (emailConflict) {
        return res.status(400).json({ success: false, error: 'A B2B partner with this email already exists.' });
      }
    }

    const updateData: any = {};
    if (companyName !== undefined) updateData.companyName = companyName.trim();
    if (contactName !== undefined) updateData.contactName = contactName.trim();
    if (email !== undefined) updateData.email = email.toLowerCase().trim();
    if (status !== undefined) updateData.status = status;
    if (isVerified !== undefined) {
      updateData.isVerified = Boolean(isVerified);
    } else if (status === 'Live') {
      updateData.isVerified = true;
    }
    if (rateLimitPerMinute !== undefined) updateData.rateLimitPerMinute = Number(rateLimitPerMinute);
    if (markupPercentage !== undefined) updateData.markupPercentage = Number(markupPercentage);
    if (apiWalletBalance !== undefined) updateData.apiWalletBalance = Number(apiWalletBalance);

    const finalUsername = username !== undefined ? username.trim() : currentClient.username;
    const finalPassword = password !== undefined ? password.trim() : currentClient.password;

    if (username !== undefined) updateData.username = finalUsername;
    if (password !== undefined) updateData.password = finalPassword;

    if (finalUsername && finalPassword) {
      updateData.basicAuthKey = Buffer.from(`${finalUsername}:${finalPassword}`).toString('base64');
    }

    const updatedClient = await B2BClient.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    res.json({ success: true, data: updatedClient });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteB2BClient = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const client = await B2BClient.findByIdAndDelete(id);

    if (!client) {
      return res.status(404).json({ success: false, error: 'B2B Client not found' });
    }

    res.json({ success: true, message: 'B2B Partner deleted permanently and all API access revoked.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getB2BClientBookings = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const client = await B2BClient.findById(id).lean();

    if (!client) {
      return res.status(404).json({ success: false, error: 'B2B Client not found' });
    }

    const partnerUser = client.email 
      ? await User.findOne({ email: client.email.toLowerCase().trim() }).lean()
      : null;

    const query: any = {
      $or: [
        { 'details.b2bClientId': client._id },
        ...(partnerUser ? [{ user: partnerUser._id }] : [])
      ]
    };

    const bookings = await Booking.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const testCount = bookings.filter(b => b.isTestBooking || b.details?.isTestBooking).length;
    const liveCount = bookings.filter(b => !b.isTestBooking && !b.details?.isTestBooking).length;
    const totalAmount = bookings.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);

    res.json({
      success: true,
      client: {
        _id: client._id,
        companyName: client.companyName,
        contactName: client.contactName,
        email: client.email,
        username: client.username,
        status: client.status,
        isVerified: client.isVerified
      },
      stats: {
        total: bookings.length,
        test: testCount,
        live: liveCount,
        totalAmount
      },
      data: bookings
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

