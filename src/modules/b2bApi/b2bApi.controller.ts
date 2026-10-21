import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import SeriesFare from '../seriesFare/seriesFare.model';
import B2BClient from './b2bClient.model';

export const authenticateB2BClient = async (req: Request, res: Response) => {
  try {
    let apiKey = req.body.apiKey || req.header('x-api-key');
    const { username, password, clientEmail } = req.body;

    if (!apiKey && req.headers.authorization && req.headers.authorization.startsWith('Basic ')) {
      const base64Credentials = req.headers.authorization.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
      const [u, p] = credentials.split(':');
      apiKey = p || u;
    }

    if (!apiKey && password) {
      apiKey = password;
    }

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Authentication failed. Please provide apiKey, or username/password, or Basic Authorization header.'
      });
    }

    const query: any = {
      $or: [{ testApiKey: apiKey }, { liveApiKey: apiKey }]
    };
    if (clientEmail || username) {
      query.email = (clientEmail || username).toLowerCase().trim();
    }

    let client = await B2BClient.findOne(query);

    if (!client) {
      client = await B2BClient.findOne({
        $or: [{ testApiKey: apiKey }, { liveApiKey: apiKey }]
      });
    }

    if (!client) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API Key or Credentials.'
      });
    }

    if (client.status === 'Suspended') {
      return res.status(403).json({
        success: false,
        error: 'Your API account has been suspended. Please contact technical support.'
      });
    }

    const isLive = client.liveApiKey === apiKey;
    if (isLive && client.status !== 'Live') {
      return res.status(403).json({
        success: false,
        error: 'Your account is not approved for LIVE mode yet. Please authenticate using your Sandbox/Test key.'
      });
    }

    const secret = process.env.JWT_SECRET || 'trippechalo_jwt_super_secret_key_2026';
    const environment = isLive ? 'PRODUCTION' : 'SANDBOX';

    const tokenId = jwt.sign(
      {
        clientId: client._id,
        companyName: client.companyName,
        isLive,
        environment
      },
      secret,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      data: {
        tokenId,
        tokenType: 'Bearer',
        expiresIn: 86400,
        environment,
        client: {
          companyName: client.companyName,
          email: client.email,
          status: client.status,
          apiWalletBalance: isLive ? client.apiWalletBalance : undefined
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const searchFlights = async (req: Request, res: Response) => {
  try {
    const { origin, destination, date, adults } = req.query;
    
    if (!origin || !destination || !date) {
      return res.status(400).json({ success: false, error: 'origin, destination, and date are required' });
    }

    const searchDate = new Date(date as string);
    const startOfDay = new Date(searchDate.setHours(0,0,0,0));
    const endOfDay = new Date(searchDate.setHours(23,59,59,999));

    const paxCount = adults ? parseInt(adults as string) : 1;

    const flights = await SeriesFare.find({
      status: 'Active',
      isArchived: false,
      origin: (origin as string).toUpperCase(),
      destination: (destination as string).toUpperCase(),
      travelDate: { $gte: startOfDay, $lte: endOfDay },
      availableSeats: { $gte: paxCount }
    });

    const markup = req.b2bClient.markupPercentage || 0;

    const results = flights.map(f => ({
      sfId: f.sfId,
      airline: f.airline,
      flightNo: f.flightNo,
      origin: f.origin,
      destination: f.destination,
      departureTime: f.departureTime,
      arrivalTime: f.arrivalTime,
      travelDate: f.travelDate,
      fare: f.adtFare + (f.adtFare * (markup / 100)),
      availableSeats: f.availableSeats,
      bookingType: f.bookingType || 'ONE_WAY',
      stops: f.segments && f.segments.length > 1 ? f.segments.length - 1 : 0,
      segments: f.segments && f.segments.length > 0 ? f.segments : undefined,
      checkinBaggage: f.checkinBaggage,
      cabinBaggage: f.cabinBaggage,
      isRefundable: f.isRefundable
    }));

    res.json({ success: true, count: results.length, data: results });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const bookFlight = async (req: Request, res: Response) => {
  try {
    const { sfId, passengers } = req.body;
    
    if (!sfId || !passengers || !Array.isArray(passengers) || passengers.length === 0) {
      return res.status(400).json({ success: false, error: 'sfId and passengers array are required' });
    }

    const flight = await SeriesFare.findOne({ sfId, status: 'Active', isArchived: false });
    if (!flight) {
      return res.status(404).json({ success: false, error: 'Flight not found or inactive' });
    }

    if (flight.availableSeats < passengers.length) {
      return res.status(400).json({ success: false, error: 'Not enough seats available' });
    }

    const totalFare = flight.adtFare * passengers.length;

    if (req.isLiveMode) {
      if (req.b2bClient.apiWalletBalance < totalFare) {
        return res.status(402).json({ success: false, error: 'Insufficient API Wallet Balance. Please recharge.' });
      }

      // 1. Deduct Balance
      req.b2bClient.apiWalletBalance -= totalFare;
      await req.b2bClient.save();

      // 2. Deduct Seats
      flight.availableSeats -= passengers.length;
      if (flight.availableSeats === 0) flight.status = 'SoldOut';
      await flight.save();

      // 3. Generate PNR
      const pnr = `TC${Math.floor(100000 + Math.random() * 900000)}`;

      return res.json({
        success: true,
        data: {
          pnr,
          status: 'CONFIRMED',
          totalAmountDeducted: totalFare,
          passengers
        }
      });

    } else {
      // Test Mode (No seat deduction, no wallet deduction)
      return res.json({
        success: true,
        data: {
          pnr: `TEST-${Math.floor(100000 + Math.random() * 900000)}`,
          status: 'TEST_CONFIRMED',
          message: 'Booking successful in TEST mode. No seats or balance deducted.',
          passengers
        }
      });
    }

  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
