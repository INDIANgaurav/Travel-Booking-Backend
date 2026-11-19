import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import SeriesFare from '../seriesFare/seriesFare.model';
import B2BClient from './b2bClient.model';
import B2BCheckoutAttempt from './b2bCheckoutAttempt.model';
import B2BWalletTransaction from './b2bWalletTransaction.model';
import Booking from '../bookings/booking.model';
import User from '../users/user.model';
import { clearFlightSearchCache } from '../searches/search.controller';
import { getOpenApiSpec, getPostmanCollection } from './b2bOpenApi';
import { normalizeClientIp } from './b2bAuth.middleware';
import { isDomesticItinerary, validateTravelDocument } from '../../utils/airport.service';
import {
  computeBookingRequestHash,
  generateB2BBookingId,
  getB2BJwtSecret,
  validateAgeForPassengerType,
  validatePassengerCounts,
} from './b2bValidators';

class B2BCheckoutError extends Error {
  status: number;
  code: string;
  details?: any[];

  constructor(status: number, code: string, message: string, details?: any[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const sendB2BSuccess = (res: Response, statusCode: number, data: any, metaExtra: Record<string, any> = {}) => {
  return res.status(statusCode).json({
    success: true,
    statusCode,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      timezone: 'Asia/Kolkata (IST)',
      currency: 'INR',
      ...metaExtra,
    },
  });
};

const sendB2BError = (res: Response, statusCode: number, code: string, message: string, details?: any[]) => {
  return res.status(statusCode).json({
    success: false,
    statusCode,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    meta: {
      timestamp: new Date().toISOString(),
      timezone: 'Asia/Kolkata (IST)',
    },
  });
};

const calculateFlightPricing = (flight: any, markupPct: number) => {
  const unitAdultFare = Math.round(flight.adtFare + flight.adtFare * (markupPct / 100));
  const baseFare = Math.round(unitAdultFare * 0.82);
  const taxAndCharges = unitAdultFare - baseFare;
  const unitChildFare = unitAdultFare;
  const baseInfant = Number(flight.infFare) > 0 ? Number(flight.infFare) : 1500;
  const unitInfantFare = Math.round(baseInfant + baseInfant * (markupPct / 100));

  return { unitAdultFare, baseFare, taxAndCharges, unitChildFare, unitInfantFare };
};

const resolveDepartureWindowOpen = (flight: any): { open: boolean; message?: string } => {
  const bookingNow = new Date();
  const flightDateStr = flight.travelDate ? new Date(flight.travelDate).toISOString().split('T')[0] : '';
  if (!flightDateStr || !flight.departureTime) return { open: true };

  const flightDepDate = new Date(`${flightDateStr}T${flight.departureTime}:00`);
  if (isNaN(flightDepDate.getTime())) return { open: false, message: 'Invalid flight schedule.' };

  const cutoffHours = Number(flight.closeBeforeDepartureHours) >= 0 ? Number(flight.closeBeforeDepartureHours) : 2;
  const cutoffDays = Number(flight.closeBeforeDepartureDays) || 0;
  const totalCutoffMs = (cutoffDays * 24 + cutoffHours) * 60 * 60 * 1000;
  const cutoffTime = new Date(flightDepDate.getTime() - totalCutoffMs);

  if (bookingNow >= cutoffTime || bookingNow >= flightDepDate) {
    return {
      open: false,
      message: `The booking window for flight ${flight.flightNo} has closed. Bookings are not permitted after departure cutoff.`,
    };
  }
  return { open: true };
};

// 1. Authentication Controller
export const authenticateB2BClient = async (req: Request, res: Response) => {
  try {
    const apiKey = (req.body.apiKey || req.header('x-api-key') || '').toString().trim();
    const { username, password } = req.body;

    let basicUser = '';
    let basicPass = '';

    if (req.headers.authorization && req.headers.authorization.startsWith('Basic ')) {
      const base64Credentials = req.headers.authorization.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
      const sepIndex = credentials.indexOf(':');
      if (sepIndex !== -1) {
        basicUser = credentials.slice(0, sepIndex);
        basicPass = credentials.slice(sepIndex + 1);
      }
    }

    const searchUser = (username || basicUser || '').toString().trim();
    const searchPass = (password || basicPass || '').toString();

    let client: any = null;
    let matchedViaApiKey: 'TEST' | 'LIVE' | null = null;

    if (apiKey) {
      client = await B2BClient.findOne({
        $or: [{ testApiKey: apiKey }, { liveApiKey: apiKey }],
      });
      if (client) {
        matchedViaApiKey = client.liveApiKey === apiKey ? 'LIVE' : 'TEST';
      }
    } else if (searchUser && searchPass) {
      // Support apiKey passed as username/password if caller formatted it that way, else verify bcrypt hash
      if (searchPass.startsWith('test_tc_') || searchPass.startsWith('live_tc_')) {
        client = await B2BClient.findOne({
          $or: [{ testApiKey: searchPass }, { liveApiKey: searchPass }],
        });
        if (client) matchedViaApiKey = client.liveApiKey === searchPass ? 'LIVE' : 'TEST';
      }

      if (!client) {
        const candidate = await B2BClient.findOne({ username: searchUser }).select('+passwordHash +password');
        if (candidate) {
          let passwordMatches = false;
          if (candidate.passwordHash) {
            passwordMatches = await bcrypt.compare(searchPass, candidate.passwordHash);
          } else if (candidate.password && candidate.password === searchPass) {
            // Legacy transition safeguard until migration runs; hashes immediately on first verified login
            passwordMatches = true;
            const passwordHash = await bcrypt.hash(searchPass, 10);
            await B2BClient.updateOne(
              { _id: candidate._id },
              { $set: { passwordHash }, $unset: { password: '', basicAuthKey: '' } }
            );
          }
          if (passwordMatches) client = candidate;
        }
      }
    }

    if (!client) {
      return sendB2BError(res, 401, 'INVALID_CREDENTIALS', 'Invalid username, password, or API credentials.');
    }

    if (client.status === 'Suspended') {
      return sendB2BError(res, 403, 'ACCOUNT_SUSPENDED', 'Your API account has been suspended. Please contact technical support.');
    }

    if (client.status === 'Pending' || (client.status !== 'Testing' && client.status !== 'Live')) {
      return sendB2BError(res, 403, 'PARTNER_NOT_ACTIVE', 'Your partner account is pending activation.');
    }

    const clientIp = normalizeClientIp(req);
    if (Array.isArray(client.allowedIPs) && client.allowedIPs.length > 0) {
      const allowed = client.allowedIPs.map((ip: string) => ip.replace(/^::ffff:/, '').trim());
      if (!allowed.includes(clientIp)) {
        return sendB2BError(res, 403, 'IP_NOT_WHITELISTED', `IP address ${clientIp} is not whitelisted for token generation.`);
      }
    }

    // Strict Environment Binding: test key ALWAYS produces SANDBOX token even for Live partners
    let isLive = false;
    if (matchedViaApiKey === 'TEST') {
      isLive = false;
    } else if (matchedViaApiKey === 'LIVE') {
      if (client.status !== 'Live') {
        return sendB2BError(
          res,
          403,
          'ENVIRONMENT_MISMATCH',
          'Live API key cannot be used while partner account is in Testing status.'
        );
      }
      isLive = true;
    } else {
      const requestedEnv = String(req.body.environment || '').trim().toUpperCase();
      if (requestedEnv === 'SANDBOX' || requestedEnv === 'TEST') {
        isLive = false;
      } else if (requestedEnv === 'LIVE' || requestedEnv === 'PRODUCTION') {
        if (client.status !== 'Live') {
          return sendB2BError(
            res,
            403,
            'ENVIRONMENT_MISMATCH',
            'Production token requested while partner account is not Live.'
          );
        }
        isLive = true;
      } else {
        isLive = client.status === 'Live';
      }
    }

    const secret = getB2BJwtSecret();
    const environment = isLive ? 'PRODUCTION' : 'SANDBOX';
    const jti = crypto.randomUUID();

    const tokenId = jwt.sign(
      {
        sub: client._id.toString(),
        clientId: client._id.toString(),
        companyName: client.companyName,
        username: client.username,
        isLive,
        env: environment,
        tokenVersion: client.tokenVersion ?? 0,
        scope: ['flights:read', 'bookings:write'],
      },
      secret,
      {
        algorithm: 'HS256',
        expiresIn: '24h',
        issuer: 'trippechalo-auth',
        audience: 'trippechalo-b2b-api',
        jwtid: jti,
      }
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
          apiWalletBalance: isLive ? client.apiWalletBalance : (client.sandboxWalletBalance ?? 500000),
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        environment,
      },
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
      availableSeats: { $gt: 0 },
      isTestFlight: isLive ? { $ne: true } : true,
    };

    const sectors = await SeriesFare.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { origin: '$origin', destination: '$destination', airline: '$airline' },
          availableDates: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$travelDate' } } },
          minFare: { $min: '$adtFare' },
          totalFlights: { $sum: 1 },
        },
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
          totalFlights: 1,
        },
      },
      { $sort: { origin: 1, destination: 1 } },
    ]);

    return sendB2BSuccess(res, 200, sectors, {
      count: sectors.length,
      environment: isLive ? 'PRODUCTION' : 'SANDBOX',
    });
  } catch (error: any) {
    return sendB2BError(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

// 3. Search Flights Controller
export const searchFlights = async (req: Request, res: Response) => {
  try {
    const params = { ...req.query, ...req.body };
    const origin = (params.origin || params.segments?.[0]?.origin || '').toString().trim().toUpperCase();
    const destination = (params.destination || params.segments?.[0]?.destination || '').toString().trim().toUpperCase();
    const rawDate = params.date || params.travelDate || params.departureDate || params.onwarddate || params.segments?.[0]?.preferredDepartureTime;
    const date = rawDate ? (typeof rawDate === 'string' && rawDate.includes('T') ? rawDate.split('T')[0] : rawDate) : null;

    if (!origin || !destination || !date) {
      return sendB2BError(
        res,
        400,
        'VALIDATION_ERROR',
        'origin (3-letter IATA), destination (3-letter IATA), and date (YYYY-MM-DD) are required.',
        [
          { field: 'origin', value: origin || null, rule: 'Required 3-letter IATA airport code' },
          { field: 'destination', value: destination || null, rule: 'Required 3-letter IATA airport code' },
          { field: 'date', value: date || null, rule: 'Required date formatted as YYYY-MM-DD' },
        ]
      );
    }

    const rawAdults = params.adults !== undefined ? params.adults : params.adultCount !== undefined ? params.adultCount : 1;
    const rawChildren = params.children !== undefined ? params.children : 0;
    const rawInfants = params.infants !== undefined ? params.infants : 0;
    const paxCounts = validatePassengerCounts(rawAdults, rawChildren, rawInfants);

    if (!paxCounts.valid) {
      const status = paxCounts.code === 'VALIDATION_ERROR' ? 400 : 422;
      return sendB2BError(res, status, paxCounts.code!, paxCounts.message!);
    }

    const { adults, children, infants } = paxCounts;
    const searchDate = new Date(date as string);
    if (isNaN(searchDate.getTime())) {
      return sendB2BError(res, 400, 'VALIDATION_ERROR', 'Invalid date format. Use YYYY-MM-DD.');
    }

    const startOfDay = new Date(searchDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(searchDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const isLive = Boolean(req.isLiveMode);
    // Lap infants occupy 0 seats unless partner specifically configured infant seat allocation
    const requiredSeats = adults + children + (req.b2bClient?.infantRequiresSeat ? infants : 0);

    const flights = await SeriesFare.find({
      status: 'Active',
      isArchived: false,
      origin,
      destination,
      travelDate: { $gte: startOfDay, $lte: endOfDay },
      availableSeats: { $gte: requiredSeats },
      isTestFlight: isLive ? { $ne: true } : true,
    });

    const validFlights = flights.filter((f) => {
      if (!f.departureTime || !f.travelDate) return false;
      if (isLive) return resolveDepartureWindowOpen(f).open;
      return true;
    });

    const markup = req.b2bClient?.markupPercentage || 0;
    const fareValidUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const results = await Promise.all(
      validFlights.map(async (f) => {
        const pricing = calculateFlightPricing(f, markup);
        const isConnecting = Boolean(f.segments && f.segments.length > 1);
        const stops = isConnecting ? f.segments!.length - 1 : 0;
        const routeScope = await isDomesticItinerary(f.origin, f.destination, f.segments);

        return {
          sfId: f.sfId,
          airline: f.airline,
          flightNo: f.flightNo,
          origin: f.origin,
          destination: f.destination,
          isDomestic: routeScope.isDomestic,
          travelDate: f.travelDate ? new Date(f.travelDate).toISOString().split('T')[0] : date,
          departureTime: f.departureTime.includes('IST') ? f.departureTime : `${f.departureTime} (IST)`,
          arrivalTime: f.arrivalTime.includes('IST') ? f.arrivalTime : `${f.arrivalTime} (IST)`,
          departureTerminal: f.departureTerminal || f.segments?.[0]?.departureTerminal || '',
          arrivalTerminal: f.arrivalTerminal || f.segments?.[f.segments.length - 1]?.arrivalTerminal || '',
          stops,
          isConnecting,
          segments: isConnecting ? f.segments : undefined,
          availableSeats: f.availableSeats,
          isRefundable: Boolean(f.isRefundable),
          baggage: {
            cabin: f.cabinBaggage || '7 Kg',
            checkin: f.checkinBaggage || '15 Kg',
          },
          pricing: {
            currency: 'INR',
            baseFare: pricing.baseFare,
            taxAndCharges: pricing.taxAndCharges,
            totalFare: pricing.unitAdultFare,
            breakdown: {
              adultFare: pricing.unitAdultFare,
              childFare: pricing.unitChildFare,
              infantFare: pricing.unitInfantFare,
            },
            fareValidUntil,
          },
        };
      })
    );

    return sendB2BSuccess(res, 200, results, {
      count: results.length,
      searchCriteria: { origin, destination, date, adults, children, infants },
      fareValidUntil,
      environment: isLive ? 'PRODUCTION' : 'SANDBOX',
    });
  } catch (error: any) {
    return sendB2BError(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

// Helper: Acquire idempotency lock via unique index on B2BCheckoutAttempt
async function acquireIdempotencyAttempt(
  partnerId: mongoose.Types.ObjectId,
  idempotencyKey: string,
  requestHash: string,
  environment: 'SANDBOX' | 'LIVE'
): Promise<{ replaySnapshot?: any; attemptId?: mongoose.Types.ObjectId; conflict?: { status: number; code: string; message: string } }> {
  try {
    const attempt = await B2BCheckoutAttempt.create({
      partnerId,
      idempotencyKey,
      requestHash,
      environment,
      status: 'PROCESSING',
    });
    return { attemptId: attempt._id as mongoose.Types.ObjectId };
  } catch (err: any) {
    if (err?.code !== 11000) throw err;

    // Duplicate key caught atomically: inspect existing attempt
    for (let wait = 0; wait < 6; wait++) {
      const existing = await B2BCheckoutAttempt.findOne({ partnerId, idempotencyKey }).lean();
      if (!existing) break;

      if (existing.requestHash !== requestHash) {
        return {
          conflict: {
            status: 409,
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency-Key was already used with a different booking payload.',
          },
        };
      }

      if (existing.status === 'SUCCEEDED' && existing.responseSnapshot) {
        return { replaySnapshot: existing.responseSnapshot };
      }

      if (existing.status === 'FAILED') {
        const reclaimed = await B2BCheckoutAttempt.findOneAndUpdate(
          { _id: existing._id, status: 'FAILED', requestHash },
          { $set: { status: 'PROCESSING' }, $unset: { errorCode: '', errorMessage: '' } },
          { new: true }
        );
        if (reclaimed) {
          return { attemptId: reclaimed._id as mongoose.Types.ObjectId };
        }
      }

      await new Promise((r) => setTimeout(r, 150));
    }

    return {
      conflict: {
        status: 409,
        code: 'IDEMPOTENCY_IN_PROGRESS',
        message: 'A booking request with this Idempotency-Key is currently processing. Please retry shortly.',
      },
    };
  }
}

// 4. Flight Booking Controller (Atomic MongoDB Transaction + Idempotency + Immutable Wallet Ledger)
export const bookFlight = async (req: Request, res: Response) => {
  let claimedAttemptId: mongoose.Types.ObjectId | undefined;

  try {
    const { sfId, passengers, contactDetails, clientBookingRef } = req.body;
    const idempotencyKey = (
      req.header('idempotency-key') ||
      req.header('x-idempotency-key') ||
      req.body.idempotencyKey ||
      clientBookingRef
    )
      ?.toString()
      .trim();

    if (!sfId || !passengers || !Array.isArray(passengers) || passengers.length === 0) {
      return sendB2BError(
        res,
        400,
        'VALIDATION_ERROR',
        'sfId and a non-empty passengers array are required.',
        [
          { field: 'sfId', issue: 'Missing or empty' },
          { field: 'passengers', issue: 'Must be an array with at least 1 passenger' },
        ]
      );
    }

    // Parse and validate passengers (same-name family members ARE allowed)
    let adultCount = 0;
    let childCount = 0;
    let infantCount = 0;

    for (let i = 0; i < passengers.length; i++) {
      const p = passengers[i];
      const firstName = (p.firstName || '').toString().trim();
      const lastName = (p.lastName || '').toString().trim();
      const type = (p.type || 'ADULT').toString().trim().toUpperCase();

      if (!firstName || !lastName) {
        return sendB2BError(
          res,
          422,
          'PASSENGER_NAME_INVALID',
          `Passenger #${i + 1} firstName and lastName are required.`
        );
      }

      if (type === 'ADULT') adultCount++;
      else if (type === 'CHILD') childCount++;
      else if (type === 'INFANT') infantCount++;
      else {
        return sendB2BError(
          res,
          422,
          'INVALID_PASSENGER_TYPE',
          `Invalid passenger type "${type}". Allowed: ADULT, CHILD, INFANT.`
        );
      }
    }

    const paxValidation = validatePassengerCounts(adultCount, childCount, infantCount);
    if (!paxValidation.valid) {
      return sendB2BError(res, 422, paxValidation.code!, paxValidation.message!);
    }

    const isLive = Boolean(req.isLiveMode);
    const environment = isLive ? 'PRODUCTION' : 'SANDBOX';
    const envCode: 'LIVE' | 'SANDBOX' = isLive ? 'LIVE' : 'SANDBOX';

    // Pre-fetch flight metadata for DOB/document validation before acquiring transaction lock
    const flightPreview = await SeriesFare.findOne({ sfId, isArchived: false }).lean();
    if (!flightPreview || (flightPreview.status !== 'Active' && flightPreview.status !== 'SoldOut')) {
      return sendB2BError(
        res,
        404,
        'FLIGHT_NOT_FOUND',
        `Flight with sfId "${sfId}" not found or is no longer active. Please search active flights and select a valid sfId.`
      );
    }

    if (flightPreview.status === 'SoldOut' || flightPreview.availableSeats <= 0) {
      return sendB2BError(
        res,
        409,
        'SEATS_NOT_AVAILABLE',
        `Flight ${sfId} is sold out.`,
        [{ available: flightPreview.availableSeats }]
      );
    }

    if (isLive && flightPreview.isTestFlight) {
      return sendB2BError(res, 403, 'TEST_FLIGHT_IN_LIVE', 'Test flights cannot be booked in Live production mode.');
    }
    if (!isLive && !flightPreview.isTestFlight) {
      return sendB2BError(res, 403, 'LIVE_FLIGHT_IN_SANDBOX', 'Live production flights cannot be booked in Sandbox environment.');
    }

    const travelDate = flightPreview.travelDate ? new Date(flightPreview.travelDate) : new Date();
    const routeScope = await isDomesticItinerary(flightPreview.origin, flightPreview.destination, flightPreview.segments);

    for (let i = 0; i < passengers.length; i++) {
      const p = passengers[i];
      const pType = (p.type || 'ADULT').toString().trim().toUpperCase() as 'ADULT' | 'CHILD' | 'INFANT';

      if (p.dob) {
        const ageCheck = validateAgeForPassengerType(String(p.dob), pType, travelDate);
        if (!ageCheck.valid) {
          return sendB2BError(res, 422, ageCheck.code!, `Passenger #${i + 1}: ${ageCheck.message}`);
        }
      }

      const docCheck = validateTravelDocument({
        isDomestic: routeScope.isDomestic,
        destinationCountry: routeScope.destinationCountry,
        travelDate,
        requirePassport: Boolean((flightPreview as any).requiresPassport),
        passportNumber: p.passportNumber,
        passportExpiry: p.passportExpiry,
        nationality: p.nationality,
      });
      if (!docCheck.valid) {
        return sendB2BError(res, 422, docCheck.code!, `Passenger #${i + 1}: ${docCheck.message}`);
      }
    }

    // Acquire atomic idempotency lock via unique index on B2BCheckoutAttempt
    if (idempotencyKey) {
      const requestHash = computeBookingRequestHash({ sfId, environment: envCode, passengers, contactDetails });
      const lock = await acquireIdempotencyAttempt(req.b2bClient._id, idempotencyKey, requestHash, envCode);

      if (lock.conflict) {
        return sendB2BError(res, lock.conflict.status, lock.conflict.code, lock.conflict.message);
      }
      if (lock.replaySnapshot) {
        return sendB2BSuccess(
          res,
          200,
          { ...lock.replaySnapshot, idempotencyReplay: true },
          { idempotencyReplay: true, environment }
        );
      }
      claimedAttemptId = lock.attemptId;
    }

    // Find or ensure partner User outside or before booking transaction (avoid write conflict on User)
    let partnerUser = await User.findOne({ email: req.b2bClient.email });
    if (!partnerUser) {
      partnerUser = await User.create({
        name: req.b2bClient.companyName || 'B2B Partner',
        email: req.b2bClient.email,
        password: crypto.randomBytes(24).toString('hex'),
        roles: ['AGENT'],
        isVerified: true,
      });
    }

    const maskPassport = (num?: string) => {
      if (!num || num.length < 4) return undefined;
      return `${num.slice(0, 2)}****${num.slice(-2)}`;
    };

    let responseData: any = null;
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        const flight = await SeriesFare.findOne({ sfId, isArchived: false }).session(session);
        if (!flight || (flight.status !== 'Active' && flight.status !== 'SoldOut')) {
          throw new B2BCheckoutError(
            404,
            'FLIGHT_NOT_FOUND',
            `Flight with sfId "${sfId}" not found or is no longer active.`
          );
        }

        if (isLive) {
          const cutoffCheck = resolveDepartureWindowOpen(flight);
          if (!cutoffCheck.open) {
            throw new B2BCheckoutError(422, 'BOOKING_WINDOW_CLOSED', cutoffCheck.message!);
          }
        }

        const seatsRequired =
          adultCount + childCount + (req.b2bClient.infantRequiresSeat ? infantCount : 0);

        if (flight.status === 'SoldOut' || flight.availableSeats < seatsRequired) {
          throw new B2BCheckoutError(
            409,
            'SEATS_NOT_AVAILABLE',
            `Seats no longer available. Requested: ${seatsRequired}, available: ${flight.availableSeats}.`,
            [{ requested: seatsRequired, available: flight.availableSeats }]
          );
        }

        const pricing = calculateFlightPricing(flight, req.b2bClient.markupPercentage || 0);
        const totalFare =
          pricing.unitAdultFare * adultCount +
          pricing.unitChildFare * childCount +
          pricing.unitInfantFare * infantCount;

        const bookingId = generateB2BBookingId();
        const bookingObjectId = new mongoose.Types.ObjectId();

        // 1. Atomic Wallet Debit + Immutable Ledger Entry (inside transaction)
        if (isLive) {
          const updatedClient = await B2BClient.findOneAndUpdate(
            { _id: req.b2bClient._id, apiWalletBalance: { $gte: totalFare } },
            { $inc: { apiWalletBalance: -totalFare } },
            { returnDocument: 'after', session }
          );

          if (!updatedClient) {
            const latestClient = await B2BClient.findById(req.b2bClient._id).session(session).lean();
            const currentBal = latestClient?.apiWalletBalance ?? req.b2bClient.apiWalletBalance;
            throw new B2BCheckoutError(
              402,
              'INSUFFICIENT_FUNDS',
              `Insufficient API Wallet Balance. Required: ₹${totalFare}, Current Balance: ₹${currentBal}. Please top-up.`,
              [{ requiredAmount: totalFare, currentBalance: currentBal }]
            );
          }

          req.b2bClient = updatedClient;
          const balanceAfter = updatedClient.apiWalletBalance;
          const balanceBefore = balanceAfter + totalFare;

          await B2BWalletTransaction.create(
            [
              {
                partnerId: updatedClient._id,
                bookingId,
                bookingRef: bookingObjectId,
                transactionType: 'DEBIT',
                amount: totalFare,
                currency: 'INR',
                balanceBefore,
                balanceAfter,
                referenceId: `TXN-DEBIT-${bookingId}`,
                description: `Live B2B flight booking ${bookingId} (${flight.origin}->${flight.destination})`,
                status: 'POSTED',
              },
            ],
            { session }
          );
        } else {
          // Simulate wallet deduction on sandboxWalletBalance for realistic testing
          const updatedSandbox = await B2BClient.findOneAndUpdate(
            { _id: req.b2bClient._id, sandboxWalletBalance: { $gte: totalFare } },
            { $inc: { sandboxWalletBalance: -totalFare } },
            { returnDocument: 'after', session }
          );
          if (!updatedSandbox) {
            const latestClient = await B2BClient.findById(req.b2bClient._id).session(session).lean();
            const currentBal = latestClient?.sandboxWalletBalance ?? 0;
            throw new B2BCheckoutError(
              402,
              'INSUFFICIENT_FUNDS',
              `Insufficient Sandbox Wallet Balance. Required: ₹${totalFare}, Current Sandbox Balance: ₹${currentBal}.`,
              [{ requiredAmount: totalFare, currentBalance: currentBal }]
            );
          }
          req.b2bClient = updatedSandbox;
        }

        // 2. Atomic CAS Seat Deduction (inside transaction)
        const updatedFlight = await SeriesFare.findOneAndUpdate(
          {
            _id: flight._id,
            status: 'Active',
            isArchived: false,
            availableSeats: { $gte: seatsRequired },
          },
          { $inc: { availableSeats: -seatsRequired } },
          { returnDocument: 'after', session }
        );

        if (!updatedFlight) {
          throw new B2BCheckoutError(
            409,
            'SEATS_NOT_AVAILABLE',
            `Seats no longer available. Requested: ${seatsRequired}, inventory was claimed concurrently.`,
            [{ requested: seatsRequired }]
          );
        }

        if (updatedFlight.availableSeats === 0) {
          await SeriesFare.updateOne({ _id: updatedFlight._id }, { $set: { status: 'SoldOut' } }, { session });
        }

        // 3. Separate booking reference vs supplier group PNR
        const originAirport = flight.origin.toUpperCase();
        const destAirport = flight.destination.toUpperCase();
        const groupPnr = flight.airlinePnr || undefined;
        const pnr = !isLive
          ? `${routeScope.isDomestic ? 'TESTDOM' : 'TESTINT'}${crypto.randomBytes(3).toString('hex').toUpperCase()}`
          : bookingId;

        const [newBooking] = await Booking.create(
          [
            {
              _id: bookingObjectId,
              user: partnerUser!._id,
              bookingId,
              type: 'FLIGHT',
              status: 'CONFIRMED',
              bookingMode: 'MYBIZ',
              paymentMethod: 'WALLET',
              isTestBooking: !isLive,
              totalAmount: totalFare,
              idempotencyKey: idempotencyKey ? `${req.b2bClient._id.toString()}:${idempotencyKey}` : undefined,
              date: new Date().toISOString().split('T')[0],
              details: {
                airline: flight.airline,
                flightNo: flight.flightNo,
                from: originAirport,
                to: destAirport,
                isDomestic: routeScope.isDomestic,
                pnr,
                groupPnr,
                bookingReference: bookingId,
                sfId: flight.sfId,
                isSeriesFare: true,
                stops: flight.segments && flight.segments.length > 1 ? flight.segments.length - 1 : 0,
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
                  name: `${p.title ? p.title + ' ' : ''}${String(p.firstName || '').trim()} ${String(p.lastName || '').trim()}`
                    .trim()
                    .toUpperCase(),
                  gender: p.gender || 'Male',
                  type: (p.type || 'ADULT').toString().trim().toUpperCase(),
                  dob: p.dob,
                  passportNum: p.passportNumber,
                  passportExpiry: p.passportExpiry,
                  nationality: p.nationality,
                  status: 'CONFIRMED',
                })),
              },
            },
          ],
          { session }
        );

        responseData = {
          bookingId: newBooking.bookingId,
          bookingReference: newBooking.bookingId,
          pnr,
          groupPnr,
          status: 'CONFIRMED',
          idempotencyReplay: false,
          clientBookingRef: clientBookingRef || null,
          totalAmount: totalFare,
          currency: 'INR',
          seatsAllocated: seatsRequired,
          isDomestic: routeScope.isDomestic,
          pricingBreakdown: {
            adultCount,
            unitAdultFare: pricing.unitAdultFare,
            childCount,
            unitChildFare: pricing.unitChildFare,
            infantCount,
            unitInfantFare: pricing.unitInfantFare,
            totalFare,
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
            stops: flight.segments && flight.segments.length > 1 ? flight.segments.length - 1 : 0,
            isConnecting: Boolean(flight.segments && flight.segments.length > 1),
            segments: flight.segments && flight.segments.length > 1 ? flight.segments : undefined,
          },
          passengers: passengers.map((p: any) => ({
            title: p.title,
            firstName: String(p.firstName || '').trim().toUpperCase(),
            lastName: String(p.lastName || '').trim().toUpperCase(),
            type: (p.type || 'ADULT').toString().trim().toUpperCase(),
            gender: p.gender || 'Male',
            passportMasked: maskPassport(p.passportNumber),
          })),
        };

        if (claimedAttemptId) {
          await B2BCheckoutAttempt.updateOne(
            { _id: claimedAttemptId },
            {
              $set: {
                status: 'SUCCEEDED',
                bookingId: newBooking.bookingId,
                bookingRef: newBooking._id,
                responseSnapshot: responseData,
              },
            },
            { session }
          );
        }
      });
    } finally {
      await session.endSession();
    }

    clearFlightSearchCache();
    return sendB2BSuccess(res, 201, responseData, { environment });
  } catch (error: any) {
    const status = error instanceof B2BCheckoutError ? error.status : 500;
    const code = error instanceof B2BCheckoutError ? error.code : 'INTERNAL_SERVER_ERROR';
    const details = error instanceof B2BCheckoutError ? error.details : undefined;

    if (claimedAttemptId) {
      await B2BCheckoutAttempt.updateOne(
        { _id: claimedAttemptId, status: 'PROCESSING' },
        { $set: { status: 'FAILED', errorCode: code, errorMessage: error.message } }
      ).catch(() => {});
    }

    return sendB2BError(res, status, code, error.message, details);
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
        { 'details.clientBookingRef': identifier },
      ],
    });

    if (!booking) {
      return sendB2BError(res, 404, 'BOOKING_NOT_FOUND', `No booking found for identifier "${identifier}".`);
    }

    return sendB2BSuccess(res, 200, {
      bookingId: booking.bookingId,
      bookingReference: booking.bookingId,
      pnr: booking.details?.pnr,
      groupPnr: booking.details?.groupPnr || null,
      status: booking.status,
      clientBookingRef: booking.details?.clientBookingRef || null,
      totalAmount: booking.totalAmount,
      currency: 'INR',
      bookingDate: booking.date,
      flight: {
        airline: booking.details?.airline,
        flightNo: booking.details?.flightNo,
        origin: booking.details?.from,
        destination: booking.details?.to,
      },
      passengers: (booking.details?.passengers || []).map((p: any) => ({
        name: p.name,
        type: p.type,
        gender: p.gender,
        status: p.status,
      })),
    });
  } catch (error: any) {
    return sendB2BError(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

// 6. Cancellation & Fare Rules Policy Controller
export const getCancellationPolicy = async (_req: Request, res: Response) => {
  return sendB2BSuccess(res, 200, {
    fareType: 'SERIES_FARE_FIXED_DEPARTURE',
    isRefundable: false,
    cancellationAllowed: false,
    penaltyPercentage: 100,
    terms: [
      'Fixed Departure (Series Fare) tickets are wholesale charter blocks and are 100% NON-REFUNDABLE once booked.',
      'Date change is strictly not permitted on fixed departure inventory.',
      'Name correction (up to 3 characters) is permitted up to 24 hours prior to departure via the offline helpdesk.',
      'In case of full airline charter cancellation, full refund is credited back to the B2B partner wallet.',
    ],
  });
};

// 7. Partner Gateway Status / Ping Controller
export const getPartnerStatus = async (req: Request, res: Response) => {
  try {
    const isLive = Boolean(req.isLiveMode);
    const environment: 'LIVE' | 'SANDBOX' = isLive ? 'LIVE' : 'SANDBOX';
    return sendB2BSuccess(res, 200, {
      status: 'UP',
      environment,
      partner: {
        companyName: req.b2bClient.companyName,
        username: req.b2bClient.username,
        status: req.b2bClient.status,
        walletBalance: isLive ? req.b2bClient.apiWalletBalance : (req.b2bClient.sandboxWalletBalance ?? 500000),
        currency: 'INR',
        rateLimits: {
          searchPerMinute: req.b2bClient.searchRateLimitPerMinute || 300,
          bookingPerMinute: req.b2bClient.bookingRateLimitPerMinute || 30,
          tokenPerMinute: req.b2bClient.tokenRateLimitPerMinute || 10,
        },
      },
      serverTime: new Date().toISOString(),
    });
  } catch (error: any) {
    return sendB2BError(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

// 8. Partner Wallet Balance Controller
export const getPartnerWalletBalance = async (req: Request, res: Response) => {
  try {
    const isLive = Boolean(req.isLiveMode);
    const environment: 'LIVE' | 'SANDBOX' = isLive ? 'LIVE' : 'SANDBOX';
    const balance = isLive ? req.b2bClient.apiWalletBalance : (req.b2bClient.sandboxWalletBalance ?? 500000);
    return sendB2BSuccess(res, 200, {
      currency: 'INR',
      balance,
      environment,
    });
  } catch (error: any) {
    return sendB2BError(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

// 9. Partner Wallet Transactions Ledger Controller
export const getPartnerWalletTransactions = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const transactions = await B2BWalletTransaction.find({ partnerId: req.b2bClient._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-__v')
      .lean();

    return sendB2BSuccess(res, 200, {
      count: transactions.length,
      transactions: transactions.map((t) => ({
        transactionId: t._id,
        referenceId: t.referenceId,
        bookingRef: t.bookingRef,
        transactionType: t.transactionType,
        amount: t.amount,
        balanceBefore: t.balanceBefore,
        balanceAfter: t.balanceAfter,
        description: t.description,
        status: t.status,
        timestamp: t.createdAt,
      })),
    });
  } catch (error: any) {
    return sendB2BError(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
  }
};

// 10. OpenAPI 3.1 Spec Endpoint
export const getOpenApiDoc = async (req: Request, res: Response) => {
  const host = req.get('host') || 'api.trippechalo.com';
  const protocol = req.protocol || 'https';
  const baseUrl = `${protocol}://${host}`;
  const spec = getOpenApiSpec(baseUrl);
  res.setHeader('Content-Type', 'application/json');
  return res.json(spec);
};

// 11. Postman Collection Endpoint
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
