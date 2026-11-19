import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import B2BClient from './b2bClient.model';
import B2BWalletTransaction from './b2bWalletTransaction.model';
import Booking from '../bookings/booking.model';
import User from '../users/user.model';

const generateApiKey = (prefix: string) => {
  const token = crypto.randomBytes(32).toString('hex');
  return `${prefix}_${token}`;
};

const generateStrongPassword = (slug: string) => {
  const base = slug.charAt(0).toUpperCase() + (slug.slice(1, 4) || 'prt');
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  return `${base}@${randomSuffix}`;
};

export const createB2BClient = async (req: Request, res: Response) => {
  try {
    const {
      companyName,
      contactName,
      email,
      status,
      rateLimitPerMinute,
      searchRateLimitPerMinute,
      bookingRateLimitPerMinute,
      markupPercentage,
      allowedIPs,
      infantRequiresSeat,
    } = req.body;

    const testApiKey = generateApiKey('test_tc');
    const liveApiKey = generateApiKey('live_tc');

    const companySlug = (companyName || contactName || 'partner')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 10) || 'partner';
    const randomPin = Math.floor(1000 + Math.random() * 9000);

    const clientUsername = (req.body.username || `${companySlug}_${randomPin}`).trim();
    const rawPassword = (req.body.password || generateStrongPassword(companySlug)).trim();
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const basicAuthKey = Buffer.from(`${clientUsername}:${rawPassword}`).toString('base64');
    const authChannel = req.body.auth_channel || 'cugtest.trippechalo.com';

    const finalCompany = (
      companyName ||
      contactName ||
      (email ? email.split('@')[0] : '') ||
      `B2B Partner ${clientUsername.slice(-4)}`
    ).trim();
    const finalContact = (contactName || companyName || 'Partner Admin').trim();
    const finalEmail = (email || `${clientUsername.toLowerCase()}@partner.trippechalo.com`).toLowerCase().trim();

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
      passwordHash,
      auth_channel: authChannel,
      testApiKey,
      liveApiKey,
      status: status || 'Testing',
      rateLimitPerMinute: rateLimitPerMinute || 60,
      searchRateLimitPerMinute: searchRateLimitPerMinute || 300,
      bookingRateLimitPerMinute: bookingRateLimitPerMinute || 30,
      tokenRateLimitPerMinute: 10,
      markupPercentage: markupPercentage || 0,
      allowedIPs: Array.isArray(allowedIPs)
        ? allowedIPs.map((s: any) => String(s).trim()).filter(Boolean)
        : (typeof allowedIPs === 'string' ? allowedIPs.split(',').map((s: string) => s.trim()).filter(Boolean) : []),
      infantRequiresSeat: Boolean(infantRequiresSeat),
      apiWalletBalance: 0,
      sandboxWalletBalance: 500000,
    });

    const sanitized = newClient.toObject();
    delete (sanitized as any).password;
    delete (sanitized as any).passwordHash;
    delete (sanitized as any).basicAuthKey;

    res.status(201).json({
      success: true,
      data: sanitized,
      // Returned strictly ONCE at creation — never stored in plaintext or retrievable later
      issuedCredentials: {
        username: clientUsername,
        password: rawPassword,
        basicAuthKey,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getB2BClients = async (req: Request, res: Response) => {
  try {
    const clients = await B2BClient.find()
      .select('-password -passwordHash -basicAuthKey')
      .sort({ createdAt: -1 })
      .lean();

    const clientEmails = clients.map((c) => (c.email ? c.email.toLowerCase().trim() : '')).filter(Boolean);
    const users = await User.find({ email: { $in: clientEmails } }).select('_id email').lean();
    const emailToUserId = new Map(users.map((u) => [u.email.toLowerCase().trim(), u._id]));

    const clientsWithStats = await Promise.all(
      clients.map(async (client) => {
        const userId = client.email ? emailToUserId.get(client.email.toLowerCase().trim()) : null;
        const query: any = {
          $or: [{ 'details.b2bClientId': client._id }, ...(userId ? [{ user: userId }] : [])],
        };

        const [totalBookings, testBookings, liveBookings] = await Promise.all([
          Booking.countDocuments(query),
          Booking.countDocuments({
            ...query,
            $or: [{ isTestBooking: true }, { 'details.isTestBooking': true }],
          }),
          Booking.countDocuments({
            ...query,
            isTestBooking: { $ne: true },
            'details.isTestBooking': { $ne: true },
          }),
        ]);

        return {
          ...client,
          totalBookings,
          testBookings,
          liveBookings,
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
      searchRateLimitPerMinute,
      bookingRateLimitPerMinute,
      markupPercentage,
      apiWalletBalance,
      allowedIPs,
      infantRequiresSeat,
    } = req.body;

    const currentClient = await B2BClient.findById(id);
    if (!currentClient) {
      return res.status(404).json({ success: false, error: 'B2B Client not found' });
    }

    if (email && email.toLowerCase().trim() !== currentClient.email.toLowerCase().trim()) {
      const emailConflict = await B2BClient.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: id },
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
    if (searchRateLimitPerMinute !== undefined) updateData.searchRateLimitPerMinute = Number(searchRateLimitPerMinute);
    if (bookingRateLimitPerMinute !== undefined) updateData.bookingRateLimitPerMinute = Number(bookingRateLimitPerMinute);
    if (markupPercentage !== undefined) updateData.markupPercentage = Number(markupPercentage);
    if (allowedIPs !== undefined) {
      updateData.allowedIPs = Array.isArray(allowedIPs)
        ? allowedIPs.map((s: any) => String(s).trim()).filter(Boolean)
        : (typeof allowedIPs === 'string' ? allowedIPs.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
    }
    if (infantRequiresSeat !== undefined) updateData.infantRequiresSeat = Boolean(infantRequiresSeat);

    const finalUsername = username !== undefined && username.trim() ? username.trim() : currentClient.username;
    if (username !== undefined && username.trim()) {
      updateData.username = finalUsername;
    }

    let issuedCredentials: { username: string; password: string; basicAuthKey: string } | undefined;
    let shouldBumpTokenVersion = status === 'Suspended';

    if (password !== undefined && String(password).trim().length > 0) {
      const rawPassword = String(password).trim();
      updateData.passwordHash = await bcrypt.hash(rawPassword, 10);
      shouldBumpTokenVersion = true;
      issuedCredentials = {
        username: finalUsername || currentClient.email,
        password: rawPassword,
        basicAuthKey: Buffer.from(`${finalUsername || currentClient.email}:${rawPassword}`).toString('base64'),
      };
    }

    const updateOps: any = {
      $set: updateData,
      $unset: { password: '', basicAuthKey: '' },
    };
    if (shouldBumpTokenVersion) {
      updateOps.$inc = { tokenVersion: 1 };
    }

    const session = await mongoose.startSession();
    let updatedClient: any = null;

    try {
      await session.withTransaction(async () => {
        const freshClient = await B2BClient.findById(id).session(session);
        if (!freshClient) throw new Error('B2B Client not found');

        if (apiWalletBalance !== undefined) {
          const targetBalance = Number(apiWalletBalance);
          if (isNaN(targetBalance) || targetBalance < 0) {
            throw new Error('apiWalletBalance must be a non-negative number.');
          }
          const oldBalance = Number(freshClient.apiWalletBalance) || 0;
          const delta = targetBalance - oldBalance;
          updateOps.$set.apiWalletBalance = targetBalance;

          if (delta !== 0) {
            const txType = delta > 0 ? 'CREDIT' : 'ADJUSTMENT';
            await B2BWalletTransaction.create(
              [
                {
                  partnerId: freshClient._id,
                  transactionType: txType,
                  amount: Math.abs(delta),
                  currency: 'INR',
                  balanceBefore: oldBalance,
                  balanceAfter: targetBalance,
                  referenceId: `TXN-ADM-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
                  description: `Admin wallet ${delta > 0 ? 'top-up' : 'adjustment'} (${oldBalance} -> ${targetBalance})`,
                  performedBy: (req as any).user?._id,
                  status: 'POSTED',
                },
              ],
              { session }
            );
          }
        }

        updatedClient = await B2BClient.findByIdAndUpdate(id, updateOps, { new: true, session }).select(
          '-password -passwordHash -basicAuthKey'
        );
      });
    } finally {
      await session.endSession();
    }

    res.json({
      success: true,
      data: updatedClient,
      ...(issuedCredentials ? { issuedCredentials } : {}),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const resetB2BClientPassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const client = await B2BClient.findById(id);
    if (!client) {
      return res.status(404).json({ success: false, error: 'B2B Client not found' });
    }

    const slug = (client.companyName || 'partner').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'partner';
    const rawPassword = (req.body?.password && String(req.body.password).trim()) || generateStrongPassword(slug);
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const username = client.username || client.email;

    await B2BClient.updateOne(
      { _id: client._id },
      {
        $set: { passwordHash },
        $inc: { tokenVersion: 1 },
        $unset: { password: '', basicAuthKey: '' },
      }
    );

    res.json({
      success: true,
      message: 'Partner password rotated. Previous session tokens have been revoked.',
      issuedCredentials: {
        username,
        password: rawPassword,
        basicAuthKey: Buffer.from(`${username}:${rawPassword}`).toString('base64'),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getB2BWalletTransactions = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const transactions = await B2BWalletTransaction.find({ partnerId: id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, data: transactions });
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
    const client = await B2BClient.findById(id).select('-password -passwordHash -basicAuthKey').lean();

    if (!client) {
      return res.status(404).json({ success: false, error: 'B2B Client not found' });
    }

    const partnerUser = client.email ? await User.findOne({ email: client.email.toLowerCase().trim() }).lean() : null;

    const query: any = {
      $or: [{ 'details.b2bClientId': client._id }, ...(partnerUser ? [{ user: partnerUser._id }] : [])],
    };

    const bookings = await Booking.find(query).sort({ createdAt: -1 }).lean();

    const testCount = bookings.filter((b) => b.isTestBooking || b.details?.isTestBooking).length;
    const liveCount = bookings.filter((b) => !b.isTestBooking && !b.details?.isTestBooking).length;
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
        isVerified: client.isVerified,
      },
      stats: {
        total: bookings.length,
        test: testCount,
        live: liveCount,
        totalAmount,
      },
      data: bookings,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
