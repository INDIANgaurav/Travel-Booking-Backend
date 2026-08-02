import { Request, Response } from 'express';
import SeriesFare from './seriesFare.model';
import { AuthRequest } from '../../middleware/auth.middleware';

export const createSeriesFare = async (req: AuthRequest, res: Response) => {
  try {
    const {
      airline,
      airlinePnr,
      bookingType,
      origin,
      destination,
      flightNo,
      departureTime,
      arrivalTime,
      departureTerminal,
      arrivalTerminal,
      travelDate,
      adtFare,
      chdFare,
      infFare,
      totalSeats,
      availableSeats,
      realtimeBook,
      status,
    } = req.body;

    // Generate a unique ID using timestamp and random number to avoid duplicate key errors
    const sfId = `SF${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;

    const seriesFare = await SeriesFare.create({
      supplierId: req.user?._id,
      supplierName: req.user?.companyName || req.user?.name || 'PJ HOLIDAY BOOKERS',
      sfId,
      airline,
      airlinePnr,
      bookingType: bookingType || 'ONE_WAY',
      origin: (origin || '').toUpperCase(),
      destination: (destination || '').toUpperCase(),
      flightNo,
      departureTime,
      arrivalTime,
      departureTerminal: departureTerminal || '',
      arrivalTerminal: arrivalTerminal || '',
      travelDate: new Date(travelDate),
      adtFare: Number(adtFare),
      chdFare: Number(chdFare || 0),
      infFare: Number(infFare || 0),
      totalSeats: Number(totalSeats || 10),
      availableSeats: Number(availableSeats !== undefined ? availableSeats : totalSeats || 10),
      realtimeBook: realtimeBook !== undefined ? realtimeBook : true,
      status: status || 'Active',
    });

    res.status(201).json(seriesFare);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getSeriesFares = async (req: Request, res: Response) => {
  try {
    const { origin, destination, date, airline, status } = req.query;
    const filter: any = {};

    if (origin) filter.origin = (origin as string).toUpperCase();
    if (destination) filter.destination = (destination as string).toUpperCase();
    if (airline) filter.airline = new RegExp(airline as string, 'i');
    if (status) filter.status = status;

    if (date) {
      const searchDate = new Date(date as string);
      const startOfDay = new Date(searchDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(searchDate.setHours(23, 59, 59, 999));
      filter.travelDate = { $gte: startOfDay, $lte: endOfDay };
    }

    const fares = await SeriesFare.find(filter).sort({ travelDate: 1, adtFare: 1 });
    res.json(fares);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateSeriesFare = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const seriesFare = await SeriesFare.findByIdAndUpdate(id, updateData, { new: true });
    if (!seriesFare) {
      return res.status(404).json({ message: 'Series fare record not found' });
    }

    res.json(seriesFare);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteSeriesFare = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await SeriesFare.findByIdAndDelete(id);
    res.json({ message: 'Series fare deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getSupplierSummary = async (req: AuthRequest, res: Response) => {
  try {
    const supplierId = req.user?._id;
    
    const faresCount = await SeriesFare.countDocuments({ supplierId, status: 'Active' });
    
    const supplierFares = await SeriesFare.find({ supplierId }).select('_id').lean();
    if (!supplierFares.length) {
      return res.json({
        activeFaresCount: 0,
        bookingCount: 0,
        bookingValue: 0,
        cancellationCount: 0,
        cancellationValue: 0
      });
    }

    const fareIds = supplierFares.map(f => f._id.toString());
    const Booking = require('../bookings/booking.model').default;

    const bookings = await Booking.find({
      type: 'FLIGHT',
      $or: [
        { 'details.flight_keys': { $in: fareIds.map(id => `SF_${id}`) } },
        { 'details.flight_keys': { $in: fareIds } }
      ]
    }).lean();

    let bookingCount = 0;
    let bookingValue = 0;
    let cancellationCount = 0;
    let cancellationValue = 0;

    bookings.forEach((b: any) => {
      if (b.status === 'CANCELLED') {
        cancellationCount += 1;
        cancellationValue += (b.totalAmount || 0);
      } else {
        bookingCount += 1;
        bookingValue += (b.totalAmount || 0);
      }
    });

    res.json({
      activeFaresCount: faresCount,
      bookingCount,
      bookingValue,
      cancellationCount,
      cancellationValue
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getSupplierBookingHistory = async (req: AuthRequest, res: Response) => {
  try {
    const supplierId = req.user?._id;
    const { refNo, pnr, airline, status, dateType, fromDate, toDate } = req.query;

    // 1. Get all SeriesFare IDs belonging to this supplier
    const supplierFares = await SeriesFare.find({ supplierId }).select('_id sfId airline origin destination flightNo travelDate departureTime arrivalTime adtFare totalSeats availableSeats').lean();
    
    if (!supplierFares.length) {
      return res.json([]);
    }

    // Build a map: sfId (ObjectId string) -> fare details
    const fareMap: Record<string, any> = {};
    const fareIds: string[] = [];
    supplierFares.forEach(f => {
      const idStr = f._id.toString();
      fareIds.push(idStr);
      fareMap[idStr] = f;
    });

    // 2. Find bookings that reference these SeriesFare IDs in flight_keys
    // flight_keys stores values like "SF_<objectId>" or just the objectId
    const Booking = require('../bookings/booking.model').default;
    
    const bookingFilter: any = {
      type: 'FLIGHT',
      $or: [
        { 'details.flight_keys': { $in: fareIds.map(id => `SF_${id}`) } },
        { 'details.flight_keys': { $in: fareIds } }
      ]
    };

    // Apply filters
    if (refNo) {
      bookingFilter.bookingId = new RegExp(refNo as string, 'i');
    }
    if (pnr) {
      bookingFilter['details.pnr'] = new RegExp(pnr as string, 'i');
    }
    if (airline && airline !== 'Select Airline') {
      bookingFilter['details.airline'] = new RegExp(airline as string, 'i');
    }
    if (status && status !== 'Select Status') {
      bookingFilter.status = (status as string).toUpperCase();
    }

    // Date filtering
    if (fromDate && toDate) {
      const from = new Date(fromDate as string);
      from.setHours(0, 0, 0, 0);
      const to = new Date(toDate as string);
      to.setHours(23, 59, 59, 999);

      if (dateType === 'travel') {
        bookingFilter.date = { $gte: from.toISOString(), $lte: to.toISOString() };
      } else {
        bookingFilter.createdAt = { $gte: from, $lte: to };
      }
    }

    const bookings = await Booking.find(bookingFilter)
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .lean();

    // 3. Enrich bookings with series fare info
    const enriched = bookings.map((b: any) => {
      const sfKey = b.details?.flight_keys?.[0] || '';
      const cleanId = sfKey.replace('SF_', '');
      const fare = fareMap[cleanId];
      return {
        ...b,
        seriesFareInfo: fare || null
      };
    });

    res.json(enriched);
  } catch (error: any) {
    console.error('Supplier booking history error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getSeriesFareQueue = async (req: AuthRequest, res: Response) => {
  try {
    const supplierId = req.user?._id;
    const { refNo, pnr, status, fromDate, toDate } = req.query;

    const supplierFares = await SeriesFare.find({ supplierId }).select('_id sfId airline origin destination flightNo travelDate adtFare').lean();
    
    if (!supplierFares.length) {
      return res.json([]);
    }

    const fareMap: Record<string, any> = {};
    const fareIds: string[] = [];
    supplierFares.forEach(f => {
      const idStr = f._id.toString();
      fareIds.push(idStr);
      fareMap[idStr] = f;
    });

    const Booking = require('../bookings/booking.model').default;
    
    const queueFilter: any = {
      type: 'FLIGHT',
      $or: [
        { 'details.flight_keys': { $in: fareIds.map(id => `SF_${id}`) } },
        { 'details.flight_keys': { $in: fareIds } }
      ]
    };

    if (refNo) queueFilter.bookingId = new RegExp(refNo as string, 'i');
    if (pnr) queueFilter['details.pnr'] = new RegExp(pnr as string, 'i');
    if (status && status !== 'All') queueFilter.status = (status as string).toUpperCase();
    else queueFilter.status = { $in: ['PENDING', 'ACTIVE'] }; // Default to pending/active queue items

    if (fromDate && toDate) {
      const from = new Date(fromDate as string);
      from.setHours(0, 0, 0, 0);
      const to = new Date(toDate as string);
      to.setHours(23, 59, 59, 999);
      queueFilter.createdAt = { $gte: from, $lte: to };
    }

    const queueItems = await Booking.find(queueFilter)
      .populate('user', 'name companyName email phone')
      .sort({ createdAt: -1 })
      .lean();

    const enriched = queueItems.map((b: any) => {
      const sfKey = b.details?.flight_keys?.[0] || '';
      const cleanId = sfKey.replace('SF_', '');
      return {
        ...b,
        seriesFareInfo: fareMap[cleanId] || null
      };
    });

    res.json(enriched);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateSeriesFareQueueStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, pnr } = req.body;
    const Booking = require('../bookings/booking.model').default;

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ message: 'Queue item not found' });
    }

    booking.status = status;
    if (pnr) {
      if (!booking.details) booking.details = {};
      booking.details.pnr = pnr;
    }

    await booking.save();
    res.json(booking);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
