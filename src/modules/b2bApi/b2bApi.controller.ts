import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import SeriesFare from '../seriesFare/seriesFare.model';
import B2BClient from './b2bClient.model';
import Booking from '../bookings/booking.model';
import User from '../users/user.model';

export const authenticateB2BClient = async (req: Request, res: Response) => {
  try {
    let apiKey = req.body.apiKey || req.header('x-api-key');
    const { username, password, clientEmail, auth_channel } = req.body;

    let basicUser = '';
    let basicPass = '';

    if (req.headers.authorization && req.headers.authorization.startsWith('Basic ')) {
      const base64Credentials = req.headers.authorization.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
      const [u, p] = credentials.split(':');
      basicUser = u;
      basicPass = p;
    }

    let client = null;

    // 1. Try finding by username & password (GAPI standard)
    const searchUser = username || basicUser;
    const searchPass = password || basicPass;

    if (searchUser && searchPass) {
      client = await B2BClient.findOne({
        username: searchUser,
        password: searchPass
      });
    }

    // 2. Fallback to API Key
    if (!client) {
      const keyToSearch = apiKey || searchPass || searchUser;
      if (keyToSearch) {
        client = await B2BClient.findOne({
          $or: [{ testApiKey: keyToSearch }, { liveApiKey: keyToSearch }]
        });
      }
    }

    if (!client) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username, password, or API credentials.'
      });
    }

    if (client.status === 'Suspended') {
      return res.status(403).json({
        success: false,
        error: 'Your API account has been suspended. Please contact technical support.'
      });
    }

    const isLive = client.liveApiKey === apiKey || client.status === 'Live';
    const secret = process.env.JWT_SECRET || 'trippechalo_jwt_super_secret_key_2026';
    const environment = isLive ? 'PRODUCTION' : 'SANDBOX';

    const tokenId = jwt.sign(
      {
        clientId: client._id,
        companyName: client.companyName,
        username: client.username,
        isLive,
        environment
      },
      secret,
      { expiresIn: '24h' }
    );

    // Return both top-level tokenId (GAPI format) and structured data
    res.json({
      success: true,
      status: 'SUCCESS',
      tokenId,
      data: {
        tokenId,
        tokenType: 'Bearer',
        expiresIn: 86400,
        environment,
        client: {
          companyName: client.companyName,
          email: client.email,
          username: client.username,
          status: client.status,
          apiWalletBalance: isLive ? client.apiWalletBalance : undefined
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getSectors = async (req: Request, res: Response) => {
  try {
    const markup = req.b2bClient?.markupPercentage || 0;
    const isLive = Boolean(req.isLiveMode);

    const matchQuery: any = {
      status: 'Active',
      isArchived: false,
      availableSeats: { $gt: 0 }
    };

    if (isLive) {
      matchQuery.isTestFlight = { $ne: true };
    } else {
      matchQuery.isTestFlight = true;
    }

    const sectors = await SeriesFare.aggregate([
      {
        $match: matchQuery
      },
      {
        $group: {
          _id: {
            origin: '$origin',
            destination: '$destination',
            airline: '$airline'
          },
          availableDates: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$travelDate' } } },
          minFare: { $min: '$adtFare' },
          totalFlights: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          origin: '$_id.origin',
          destination: '$_id.destination',
          airline: '$_id.airline',
          availableDates: 1,
          minFare: { $add: ['$minFare', { $multiply: ['$minFare', markup / 100] }] },
          totalFlights: 1
        }
      },
      {
        $sort: { origin: 1, destination: 1 }
      }
    ]);

    res.json({
      success: true,
      status: 'SUCCESS',
      count: sectors.length,
      data: sectors
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const searchFlights = async (req: Request, res: Response) => {
  try {
    const params = { ...req.query, ...req.body };
    const origin = params.origin || (params.segments && params.segments[0]?.origin);
    const destination = params.destination || (params.segments && params.segments[0]?.destination);
    const rawDate = params.date || params.travelDate || params.departureDate || params.onwarddate || (params.segments && params.segments[0]?.preferredDepartureTime);
    const date = rawDate ? (typeof rawDate === 'string' && rawDate.includes('T') ? rawDate.split('T')[0] : rawDate) : null;
    const adults = params.adults || params.adultCount;
    
    if (!origin || !destination || !date) {
      return res.status(400).json({ 
        success: false, 
        error: 'origin, destination, and date (or travelDate / segments) are required. Example: { "origin": "DEL", "destination": "BOM", "date": "2026-12-10" }' 
      });
    }

    const searchDate = new Date(date as string);
    const startOfDay = new Date(searchDate);
    startOfDay.setUTCHours(0,0,0,0);
    const endOfDay = new Date(searchDate);
    endOfDay.setUTCHours(23,59,59,999);

    const paxCount = adults ? parseInt(adults as string) : 1;
    const isLive = Boolean(req.isLiveMode);

    const flightQuery: any = {
      status: 'Active',
      isArchived: false,
      origin: (origin as string).toUpperCase(),
      destination: (destination as string).toUpperCase(),
      travelDate: { $gte: startOfDay, $lte: endOfDay },
      availableSeats: { $gte: paxCount }
    };

    if (isLive) {
      flightQuery.isTestFlight = { $ne: true };
    } else {
      flightQuery.isTestFlight = true;
    }

    const flights = await SeriesFare.find(flightQuery);

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

    const isLive = Boolean(req.isLiveMode);

    // Environment safety checks
    if (isLive && flight.isTestFlight) {
      return res.status(403).json({ success: false, error: 'Test flights cannot be booked in Live production mode.' });
    }
    if (!isLive && !flight.isTestFlight) {
      return res.status(403).json({ success: false, error: 'This flight is a Live flight and not available in Sandbox test environment.' });
    }

    if (flight.availableSeats < passengers.length) {
      return res.status(400).json({ success: false, error: 'Not enough seats available' });
    }

    const markup = req.b2bClient.markupPercentage || 0;
    const unitFare = flight.adtFare + (flight.adtFare * (markup / 100));
    const totalFare = unitFare * passengers.length;

    // Check Live balance if in live mode
    if (isLive) {
      if (req.b2bClient.apiWalletBalance < totalFare) {
        return res.status(402).json({ success: false, error: 'Insufficient API Wallet Balance. Please recharge.' });
      }
      req.b2bClient.apiWalletBalance -= totalFare;
      await req.b2bClient.save();
    }

    // Deduct seats and update inventory
    flight.availableSeats = Math.max(0, flight.availableSeats - passengers.length);
    if (flight.availableSeats === 0) {
      flight.status = 'SoldOut';
    }
    await flight.save();

    // Find or create a User account for the partner so bookings appear on the Admin Dashboard
    let partnerUser = await User.findOne({ email: req.b2bClient.email });
    if (!partnerUser) {
      partnerUser = await User.create({
        name: req.b2bClient.companyName || 'B2B Partner',
        email: req.b2bClient.email,
        password: 'B2B_PARTNER_API_MANAGED_' + Math.random().toString(36).slice(-8),
        roles: ['AGENT'],
        isVerified: true
      });
    }

    // Generate PNR and Booking ID
    const pnr = `TC${Math.floor(100000 + Math.random() * 900000)}`;
    const bookingId = `BK-B2B-${Math.floor(100000 + Math.random() * 900000)}`;

    // Create the actual Booking in the database
    const newBooking = await Booking.create({
      user: partnerUser._id,
      bookingId,
      type: 'FLIGHT',
      status: 'CONFIRMED',
      bookingMode: 'MYBIZ',
      paymentMethod: 'WALLET',
      isTestBooking: !isLive,
      totalAmount: totalFare,
      date: new Date().toISOString().split('T')[0],
      details: {
        airline: flight.airline,
        flightNo: flight.flightNo,
        from: flight.origin,
        to: flight.destination,
        pnr: pnr,
        isSeriesFare: true,
        isTestBooking: !isLive,
        flightId: flight._id,
        passengers: passengers.map((p: any) => ({
          name: `${p.title ? p.title + ' ' : ''}${p.firstName || ''} ${p.lastName || ''}`.trim(),
          gender: p.gender || 'Male',
          type: p.type || 'ADULT',
          status: 'CONFIRMED'
        }))
      }
    });

    return res.json({
      success: true,
      data: {
        pnr,
        bookingId: newBooking.bookingId,
        status: 'CONFIRMED',
        message: 'Flight booked successfully.',
        flight: {
          sfId: flight.sfId,
          airline: flight.airline,
          flightNo: flight.flightNo,
          origin: flight.origin,
          destination: flight.destination,
          travelDate: flight.travelDate,
          departureTime: flight.departureTime,
          arrivalTime: flight.arrivalTime,
          remainingSeats: flight.availableSeats,
          totalFare
        },
        passengers
      }
    });

  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
