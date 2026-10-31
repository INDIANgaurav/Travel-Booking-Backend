import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import SeriesFare from '../seriesFare/seriesFare.model';
import B2BClient from './b2bClient.model';
import Booking from '../bookings/booking.model';
import User from '../users/user.model';
import { clearFlightSearchCache } from '../searches/search.controller';
import { getOpenApiSpec, getPostmanCollection } from './b2bOpenApi';

// Helper: Standardized Success Response Envelope
const sendB2BSuccess = (res: Response, statusCode: number, data: any, metaExtra: Record<string, any> = {}) => {
  return res.status(statusCode).json({
    success: true,
    statusCode,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      timezone: 'Asia/Kolkata (IST)',
      currency: 'INR',
      ...metaExtra
    }
  });
};

// Helper: Standardized Error Response Envelope
const sendB2BError = (res: Response, statusCode: number, code: string, message: string, details?: any[]) => {
  return res.status(statusCode).json({
    success: false,
    statusCode,
    error: {
      code,
      message,
      ...(details ? { details } : {})
    },
    meta: {
      timestamp: new Date().toISOString(),
      timezone: 'Asia/Kolkata (IST)'
    }
  });
};

// 1. Authentication Controller
export const authenticateB2BClient = async (req: Request, res: Response) => {
  try {
    let apiKey = req.body.apiKey || req.header('x-api-key');
    const { username, password } = req.body;

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

    // A. Search by Username & Password
    const searchUser = username || basicUser;
    const searchPass = password || basicPass;

    if (searchUser && searchPass) {
      client = await B2BClient.findOne({
        username: searchUser,
        password: searchPass
      });
    }

    // B. Fallback to API Key
    if (!client) {
      const keyToSearch = apiKey || searchPass || searchUser;
      if (keyToSearch) {
        client = await B2BClient.findOne({
          $or: [{ testApiKey: keyToSearch }, { liveApiKey: keyToSearch }]
        });
      }
    }

    if (!client) {
      return sendB2BError(res, 401, 'INVALID_CREDENTIALS', 'Invalid username, password, or API credentials.');
    }

    if (client.status === 'Suspended') {
      return sendB2BError(res, 403, 'ACCOUNT_SUSPENDED', 'Your API account has been suspended. Please contact technical support.');
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

    return res.json({
      success: true,
      statusCode: 200,
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
          apiWalletBalance: isLive ? client.apiWalletBalance : 500000 // Mock 5L balance in sandbox
        }
      },
      meta: {
        timestamp: new Date().toISOString(),
        environment
      }
    });
  } catch (error: any) {
    return sendB2BError(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

// 2. Available Sectors Controller
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
          currency: { $literal: 'INR' },
          availableDates: 1,
          minFare: { $add: ['$minFare', { $multiply: ['$minFare', markup / 100] }] },
          totalFlights: 1
        }
      },
      {
        $sort: { origin: 1, destination: 1 }
      }
    ]);

    return sendB2BSuccess(res, 200, sectors, {
      count: sectors.length,
      environment: isLive ? 'PRODUCTION' : 'SANDBOX'
    });
  } catch (error: any) {
    return sendB2BError(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

// 3. Search Flights Controller
export const searchFlights = async (req: Request, res: Response) => {
  try {
    const params = { ...req.query, ...req.body };
    const origin = (params.origin || (params.segments && params.segments[0]?.origin) || '').toString().trim().toUpperCase();
    const destination = (params.destination || (params.segments && params.segments[0]?.destination) || '').toString().trim().toUpperCase();
    const rawDate = params.date || params.travelDate || params.departureDate || params.onwarddate || (params.segments && params.segments[0]?.preferredDepartureTime);
    const date = rawDate ? (typeof rawDate === 'string' && rawDate.includes('T') ? rawDate.split('T')[0] : rawDate) : null;
    
    const adults = params.adults ? parseInt(params.adults as string) : (params.adultCount ? parseInt(params.adultCount as string) : 1);
    const children = params.children ? parseInt(params.children as string) : 0;
    const infants = params.infants ? parseInt(params.infants as string) : 0;

    // Validate Input
    if (!origin || !destination || !date) {
      return sendB2BError(
        res,
        400,
        'VALIDATION_ERROR',
        'origin (3-letter IATA), destination (3-letter IATA), and date (YYYY-MM-DD) are required.',
        [
          { field: 'origin', value: origin || null, rule: 'Required 3-letter IATA airport code' },
          { field: 'destination', value: destination || null, rule: 'Required 3-letter IATA airport code' },
          { field: 'date', value: date || null, rule: 'Required date formatted as YYYY-MM-DD' }
        ]
      );
    }

    if (adults < 1 || adults > 9) {
      return sendB2BError(res, 400, 'VALIDATION_ERROR', 'Adult count must be between 1 and 9.');
    }
    if (infants > adults) {
      return sendB2BError(res, 422, 'INFANT_COUNT_EXCEEDED', 'Number of infants cannot exceed the number of adult passengers (1 infant per adult on lap).');
    }

    const searchDate = new Date(date as string);
    if (isNaN(searchDate.getTime())) {
      return sendB2BError(res, 400, 'VALIDATION_ERROR', 'Invalid date format. Use YYYY-MM-DD.');
    }

    const startOfDay = new Date(searchDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(searchDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const isLive = Boolean(req.isLiveMode);
    const requiredSeats = adults + children + infants; // Every passenger including infant is allocated an individual seat

    const flightQuery: any = {
      status: 'Active',
      isArchived: false,
      origin,
      destination,
      travelDate: { $gte: startOfDay, $lte: endOfDay },
      availableSeats: { $gte: requiredSeats }
    };

    if (isLive) {
      flightQuery.isTestFlight = { $ne: true };
    } else {
      flightQuery.isTestFlight = true;
    }

    const flights = await SeriesFare.find(flightQuery);
    const markup = req.b2bClient?.markupPercentage || 0;
    const fareValidUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins lock window

    let results = flights.map(f => {
      const unitAdultFare = Math.round(f.adtFare + (f.adtFare * (markup / 100)));
      const baseFare = Math.round(unitAdultFare * 0.82);
      const taxAndCharges = unitAdultFare - baseFare;
      const unitChildFare = unitAdultFare;
      const unitInfantFare = 1500;
      const isConnecting = Boolean(f.segments && f.segments.length > 1);
      const stops = isConnecting ? f.segments!.length - 1 : 0;

      return {
        sfId: f.sfId,
        airline: f.airline,
        flightNo: f.flightNo,
        origin: f.origin,
        destination: f.destination,
        travelDate: f.travelDate ? new Date(f.travelDate).toISOString().split('T')[0] : date,
        departureTime: f.departureTime.includes('IST') ? f.departureTime : `${f.departureTime} (IST)`,
        arrivalTime: f.arrivalTime.includes('IST') ? f.arrivalTime : `${f.arrivalTime} (IST)`,
        departureTerminal: f.departureTerminal || (f.segments?.[0]?.departureTerminal) || '',
        arrivalTerminal: f.arrivalTerminal || (f.segments?.[f.segments.length - 1]?.arrivalTerminal) || '',
        stops,
        isConnecting,
        segments: isConnecting ? f.segments : undefined,
        availableSeats: f.availableSeats,
        isRefundable: Boolean(f.isRefundable),
        baggage: {
          cabin: f.cabinBaggage || '7 Kg',
          checkin: f.checkinBaggage || '15 Kg'
        },
        pricing: {
          currency: 'INR',
          baseFare,
          taxAndCharges,
          totalFare: unitAdultFare,
          breakdown: {
            adultFare: unitAdultFare,
            childFare: unitChildFare,
            infantFare: unitInfantFare
          },
          fareValidUntil
        }
      };
    });

    return sendB2BSuccess(res, 200, results, {
      count: results.length,
      searchCriteria: { origin, destination, date, adults, children, infants },
      fareValidUntil,
      environment: isLive ? 'PRODUCTION' : 'SANDBOX'
    });
  } catch (error: any) {
    return sendB2BError(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

// 4. Flight Booking Controller (With Atomic CAS & Idempotency)
export const bookFlight = async (req: Request, res: Response) => {
  try {
    const { sfId, passengers, contactDetails, clientBookingRef } = req.body;
    const idempotencyKey = (
      req.header('idempotency-key') ||
      req.header('x-idempotency-key') ||
      req.body.idempotencyKey ||
      clientBookingRef
    )?.toString().trim();

    // 1. Basic Validation
    if (!sfId || !passengers || !Array.isArray(passengers) || passengers.length === 0) {
      return sendB2BError(
        res,
        400,
        'VALIDATION_ERROR',
        'sfId and a non-empty passengers array are required.',
        [{ field: 'sfId', issue: 'Missing or empty' }, { field: 'passengers', issue: 'Must be an array with at least 1 passenger' }]
      );
    }

    if (passengers.length > 9) {
      return sendB2BError(res, 400, 'VALIDATION_ERROR', 'Maximum 9 passengers allowed per booking request.');
    }

    // 2. Idempotency Check: Return existing booking if key was already processed
    if (idempotencyKey) {
      const existingBooking = await Booking.findOne({
        'details.b2bClientId': req.b2bClient._id,
        $or: [
          { idempotencyKey },
          { 'details.idempotencyKey': idempotencyKey },
          { 'details.clientBookingRef': idempotencyKey }
        ]
      });

      if (existingBooking) {
        return sendB2BSuccess(res, 200, {
          bookingId: existingBooking.bookingId,
          pnr: existingBooking.details?.pnr,
          status: existingBooking.status,
          idempotencyReplay: true,
          message: 'Idempotency replay: request was already processed. Returning existing booking.',
          totalAmount: existingBooking.totalAmount,
          currency: 'INR',
          flight: {
            airline: existingBooking.details?.airline,
            flightNo: existingBooking.details?.flightNo,
            origin: existingBooking.details?.from,
            destination: existingBooking.details?.to
          },
          passengers: existingBooking.details?.passengers || []
        }, { idempotencyReplay: true });
      }
    }

    // 3. Passenger Validation & Age Categories
    let adultCount = 0;
    let childCount = 0;
    let infantCount = 0;
    const passengerNamesSet = new Set<string>();

    for (let i = 0; i < passengers.length; i++) {
      const p = passengers[i];
      const firstName = (p.firstName || '').trim().toUpperCase();
      const lastName = (p.lastName || '').trim().toUpperCase();
      const type = (p.type || 'ADULT').toUpperCase();

      if (!firstName || !lastName || firstName.length < 2 || lastName.length < 2) {
        return sendB2BError(
          res,
          422,
          'PASSENGER_NAME_INVALID',
          `Passenger #${i + 1} firstName and lastName must each be at least 2 characters long.`
        );
      }

      const fullNameKey = `${firstName}_${lastName}`;
      if (passengerNamesSet.has(fullNameKey)) {
        return sendB2BError(
          res,
          422,
          'DUPLICATE_PASSENGER',
          `Duplicate passenger detected in same booking: "${firstName} ${lastName}". Each passenger must have a unique full name.`
        );
      }
      passengerNamesSet.add(fullNameKey);

      if (type === 'ADULT') adultCount++;
      else if (type === 'CHILD') childCount++;
      else if (type === 'INFANT') infantCount++;
      else {
        return sendB2BError(res, 422, 'INVALID_PASSENGER_TYPE', `Invalid passenger type "${type}". Allowed: ADULT, CHILD, INFANT.`);
      }
    }

    if (adultCount === 0) {
      return sendB2BError(res, 422, 'NO_ADULT_PASSENGER', 'At least 1 adult passenger is required per booking.');
    }
    if (infantCount > adultCount) {
      return sendB2BError(res, 422, 'INFANT_COUNT_EXCEEDED', 'Number of infants cannot exceed the number of adult passengers.');
    }

    const seatsRequired = adultCount + childCount + infantCount; // Every passenger including infant gets a dedicated seat allocated
    const isLive = Boolean(req.isLiveMode);

    // 4. Fetch Flight from Database
    const flight = await SeriesFare.findOne({ sfId, status: 'Active', isArchived: false });

    if (!flight) {
      return sendB2BError(
        res,
        404,
        'FLIGHT_NOT_FOUND',
        `Flight with sfId "${sfId}" not found or is no longer active. Please search active flights and select a valid sfId.`
      );
    }

    // Safety checks for mode
    if (isLive && flight.isTestFlight) {
      return sendB2BError(res, 403, 'TEST_FLIGHT_IN_LIVE', 'Test flights cannot be booked in Live production mode.');
    }
    if (!isLive && !flight.isTestFlight) {
      return sendB2BError(res, 403, 'LIVE_FLIGHT_IN_SANDBOX', 'Live production flights cannot be booked in Sandbox environment.');
    }

    // Check available seats
    if (flight.availableSeats < seatsRequired) {
      return sendB2BError(
        res,
        409,
        'SEATS_NOT_AVAILABLE',
        `Seats no longer available. Requested: ${seatsRequired}, available: ${flight.availableSeats}.`,
        [{ requested: seatsRequired, available: flight.availableSeats }]
      );
    }

    const markup = req.b2bClient.markupPercentage || 0;
    const unitAdultFare = Math.round(flight.adtFare + (flight.adtFare * (markup / 100)));
    const unitChildFare = unitAdultFare;
    const unitInfantFare = 1500;
    const totalFare = (unitAdultFare * adultCount) + (unitChildFare * childCount) + (unitInfantFare * infantCount);

    // 5. Wallet Deduction for Live Mode (Atomic Compare-And-Swap)
    if (isLive) {
      const updatedClient = await B2BClient.findOneAndUpdate(
        { _id: req.b2bClient._id, apiWalletBalance: { $gte: totalFare } },
        { $inc: { apiWalletBalance: -totalFare } },
        { returnDocument: 'after' }
      );
      if (!updatedClient) {
        return sendB2BError(
          res,
          402,
          'INSUFFICIENT_FUNDS',
          `Insufficient API Wallet Balance. Required: ₹${totalFare}, Current Balance: ₹${req.b2bClient.apiWalletBalance}. Please top-up.`,
          [{ requiredAmount: totalFare, currentBalance: req.b2bClient.apiWalletBalance }]
        );
      }
      req.b2bClient = updatedClient;
    }

    // 6. ATOMIC SEAT DEDUCTION (Compare-And-Swap / CAS)
    // Concurrency guarantee: Deducts only if availableSeats >= seatsRequired at exact moment of update
    if (flight) {
      const updatedFlight = await SeriesFare.findOneAndUpdate(
        {
          _id: flight._id,
          status: 'Active',
          isArchived: false,
          availableSeats: { $gte: seatsRequired }
        },
        {
          $inc: { availableSeats: -seatsRequired }
        },
        { returnDocument: 'after' }
      );

      if (!updatedFlight) {
        // Race condition caught! Concurrent user booked the last seat(s)
        // Rollback wallet balance if in live mode
        if (isLive) {
          await B2BClient.updateOne(
            { _id: req.b2bClient._id },
            { $inc: { apiWalletBalance: totalFare } }
          );
        }
        return sendB2BError(
          res,
          409,
          'SEATS_NOT_AVAILABLE',
          `Seats no longer available. Requested: ${seatsRequired}, but inventory was claimed by another concurrent booking request.`,
          [{ requested: seatsRequired }]
        );
      }

      if (updatedFlight.availableSeats === 0) {
        await SeriesFare.updateOne({ _id: updatedFlight._id }, { status: 'SoldOut' });
      }

      clearFlightSearchCache();
    }

    // 7. Find or create User record for partner
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

    // Determine PNR and Airport types
    const originAirport = flight.origin.toUpperCase();
    const destAirport = flight.destination.toUpperCase();
    const indianAirports = new Set(['DEL', 'BOM', 'BLR', 'GOI', 'GOX', 'CCU', 'HYD', 'MAA', 'PNQ', 'AMD', 'JAI']);
    const isInternational = !indianAirports.has(originAirport) || !indianAirports.has(destAirport);

    let pnr = '';
    if (!isLive) {
      const pnrPrefix = isInternational ? 'TESTINT' : 'TESTDOM';
      pnr = `${pnrPrefix}${Math.floor(100000 + Math.random() * 900000)}`;
    } else {
      pnr = flight.airlinePnr || `TC${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    }
    const bookingId = `BK-B2B-${Math.floor(100000 + Math.random() * 900000)}`;

    // Helper for PII masking
    const maskPassport = (num?: string) => {
      if (!num || num.length < 4) return undefined;
      return `${num.slice(0, 2)}****${num.slice(-2)}`;
    };

    // 8. Create the Booking Record in Database
    const newBooking = await Booking.create({
      user: partnerUser._id,
      bookingId,
      type: 'FLIGHT',
      status: 'CONFIRMED',
      bookingMode: 'MYBIZ',
      paymentMethod: 'WALLET',
      isTestBooking: !isLive,
      totalAmount: totalFare,
      idempotencyKey: idempotencyKey || undefined,
      date: new Date().toISOString().split('T')[0],
      details: {
        airline: flight.airline,
        flightNo: flight.flightNo,
        from: originAirport,
        to: destAirport,
        pnr,
        sfId: flight.sfId,
        isSeriesFare: true,
        stops: (flight.segments && flight.segments.length > 1) ? flight.segments.length - 1 : 0,
        isConnecting: Boolean(flight.segments && flight.segments.length > 1),
        segments: flight.segments || [],
        isTestBooking: !isLive,
        b2bClientId: req.b2bClient._id,
        b2bCompanyName: req.b2bClient.companyName,
        b2bUsername: req.b2bClient.username,
        idempotencyKey: idempotencyKey || undefined,
        clientBookingRef: clientBookingRef || undefined,
        flightId: flight._id,
        contactDetails: contactDetails || { email: req.b2bClient.email },
        passengers: passengers.map((p: any) => ({
          name: `${p.title ? p.title + ' ' : ''}${p.firstName || ''} ${p.lastName || ''}`.trim().toUpperCase(),
          gender: p.gender || 'Male',
          type: (p.type || 'ADULT').toUpperCase(),
          dob: p.dob,
          passportNum: p.passportNumber,
          passportExpiry: p.passportExpiry,
          status: 'CONFIRMED'
        }))
      }
    });

    return sendB2BSuccess(res, 201, {
      bookingId: newBooking.bookingId,
      pnr,
      status: 'CONFIRMED',
      idempotencyReplay: false,
      clientBookingRef: clientBookingRef || null,
      totalAmount: totalFare,
      currency: 'INR',
      seatsAllocated: seatsRequired,
      pricingBreakdown: {
        adultCount,
        unitAdultFare,
        childCount,
        unitChildFare,
        infantCount,
        unitInfantFare,
        totalFare
      },
      flight: {
        sfId: flight.sfId,
        airline: flight.airline,
        flightNo: flight.flightNo,
        origin: originAirport,
        destination: destAirport,
        travelDate: new Date(flight.travelDate).toISOString().split('T')[0],
        departureTime: flight.departureTime,
        arrivalTime: flight.arrivalTime,
        stops: (flight.segments && flight.segments.length > 1) ? flight.segments.length - 1 : 0,
        isConnecting: Boolean(flight.segments && flight.segments.length > 1),
        segments: (flight.segments && flight.segments.length > 1) ? flight.segments : undefined
      },
      passengers: passengers.map((p: any) => ({
        title: p.title,
        firstName: p.firstName?.toUpperCase(),
        lastName: p.lastName?.toUpperCase(),
        type: (p.type || 'ADULT').toUpperCase(),
        gender: p.gender || 'Male',
        passportMasked: maskPassport(p.passportNumber)
      }))
    }, { environment: isLive ? 'PRODUCTION' : 'SANDBOX' });
  } catch (error: any) {
    return sendB2BError(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

// 5. Retrieve Booking Controller (by bookingId or PNR)
export const getBookingDetails = async (req: Request, res: Response) => {
  try {
    const identifier = (req.params.bookingId || req.query.pnr || req.query.bookingId || '').toString().trim();

    if (!identifier) {
      return sendB2BError(res, 400, 'VALIDATION_ERROR', 'bookingId or pnr is required in path or query.');
    }

    const booking = await Booking.findOne({
      'details.b2bClientId': req.b2bClient._id,
      $or: [
        { bookingId: identifier },
        { 'details.pnr': identifier },
        { 'details.clientBookingRef': identifier }
      ]
    });

    if (!booking) {
      return sendB2BError(res, 404, 'BOOKING_NOT_FOUND', `No booking found for identifier "${identifier}".`);
    }

    return sendB2BSuccess(res, 200, {
      bookingId: booking.bookingId,
      pnr: booking.details?.pnr,
      status: booking.status,
      clientBookingRef: booking.details?.clientBookingRef || null,
      totalAmount: booking.totalAmount,
      currency: 'INR',
      bookingDate: booking.date,
      flight: {
        airline: booking.details?.airline,
        flightNo: booking.details?.flightNo,
        origin: booking.details?.from,
        destination: booking.details?.to
      },
      passengers: (booking.details?.passengers || []).map((p: any) => ({
        name: p.name,
        type: p.type,
        gender: p.gender,
        status: p.status
      }))
    });
  } catch (error: any) {
    return sendB2BError(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

// 6. Cancellation & Fare Rules Policy Controller
export const getCancellationPolicy = async (req: Request, res: Response) => {
  return sendB2BSuccess(res, 200, {
    fareType: 'SERIES_FARE_FIXED_DEPARTURE',
    isRefundable: false,
    cancellationAllowed: false,
    penaltyPercentage: 100,
    terms: [
      'Fixed Departure (Series Fare) tickets are wholesale charter blocks and are 100% NON-REFUNDABLE once booked.',
      'Date change is strictly not permitted on fixed departure inventory.',
      'Name correction (up to 3 characters) is permitted up to 24 hours prior to departure via the offline helpdesk.',
      'In case of full airline charter cancellation, full refund is credited back to the B2B partner wallet.'
    ]
  });
};

// 7. OpenAPI 3.1 Spec Endpoint
export const getOpenApiDoc = async (req: Request, res: Response) => {
  const host = req.get('host') || 'api.trippechalo.com';
  const protocol = req.protocol || 'https';
  const baseUrl = `${protocol}://${host}`;
  const spec = getOpenApiSpec(baseUrl);
  res.setHeader('Content-Type', 'application/json');
  return res.json(spec);
};

// 8. Postman Collection Endpoint
export const getPostmanDoc = async (req: Request, res: Response) => {
  const isLive = req.query.env === 'live';
  const host = req.get('host') || 'api.trippechalo.com';
  const protocol = req.protocol || 'https';
  const baseUrl = `${protocol}://${host}`;
  const collection = getPostmanCollection(req.b2bClient, isLive, baseUrl);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=TrippeChalo_India_Postman_${isLive ? 'LIVE' : 'SANDBOX'}.json`);
  return res.json(collection);
};
