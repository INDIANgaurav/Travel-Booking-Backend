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

export const getSeriesFares = async (req: AuthRequest, res: Response) => {
  try {
    const { origin, destination, date, airline, status } = req.query;
    const filter: any = {};

    // Strict Data Isolation: ID-based linking
    if (req.user?.role === 'SUPPLIER_AGENT' || req.user?.role === 'SUPPLIER_STAFF') {
      filter.supplierId = req.user.role === 'SUPPLIER_STAFF' ? req.user.supplierOwnerId : req.user._id;
    }

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

    const fares = await SeriesFare.find(filter).sort({ travelDate: 1, adtFare: 1 }).lean();
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
    const supplierId = req.user?.role === 'SUPPLIER_STAFF' ? req.user?.supplierOwnerId : req.user?._id;
    
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

    const Booking = require('../bookings/booking.model').default;
    const mongoose = require('mongoose');

    const aggResult = await Booking.aggregate([
      { $match: { type: 'FLIGHT' } },
      { 
         $addFields: {
           cleanFlightKeys: {
             $map: {
               input: { $ifNull: ['$details.flight_keys', []] },
               as: 'fk',
               in: {
                 $convert: {
                   input: { $replaceAll: { input: '$$fk', find: 'SF_', replacement: '' } },
                   to: 'objectId',
                   onError: null,
                   onNull: null
                 }
               }
             }
           }
         }
      },
      {
        $lookup: {
          from: 'seriesfares',
          localField: 'cleanFlightKeys',
          foreignField: '_id',
          as: 'seriesFares'
        }
      },
      {
        $match: {
          'seriesFares.supplierId': new mongoose.Types.ObjectId(supplierId)
        }
      },
      {
        $group: {
          _id: null,
          bookingCount: { 
            $sum: { $cond: [{ $ne: ['$status', 'CANCELLED'] }, 1, 0] } 
          },
          bookingValue: { 
            $sum: { $cond: [{ $ne: ['$status', 'CANCELLED'] }, { $ifNull: ['$totalAmount', 0] }, 0] } 
          },
          cancellationCount: { 
            $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] } 
          },
          cancellationValue: { 
            $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, { $ifNull: ['$totalAmount', 0] }, 0] } 
          }
        }
      }
    ]);

    const stats = aggResult[0] || {
      bookingCount: 0,
      bookingValue: 0,
      cancellationCount: 0,
      cancellationValue: 0
    };

    res.json({
      activeFaresCount: faresCount,
      ...stats
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getSupplierBookingHistory = async (req: AuthRequest, res: Response) => {
  try {
    const mongoose = require('mongoose');
    const supplierId = req.user?.role === 'SUPPLIER_STAFF' ? req.user.supplierOwnerId : req.user?._id;
    const { refNo, pnr, airline, status, dateType, fromDate, toDate } = req.query;

    const Booking = require('../bookings/booking.model').default;
    
    const bookingFilter: any = { type: 'FLIGHT' };

    // Apply filters
    if (refNo) bookingFilter.bookingId = new RegExp(refNo as string, 'i');
    if (pnr) bookingFilter['details.pnr'] = new RegExp(pnr as string, 'i');
    if (airline && airline !== 'Select Airline') bookingFilter['details.airline'] = new RegExp(airline as string, 'i');
    if (status && status !== 'Select Status') bookingFilter.status = (status as string).toUpperCase();

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

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const matchPipeline = [
      { $match: bookingFilter },
      { 
         $addFields: {
           cleanFlightKeys: {
             $map: {
               input: { $ifNull: ['$details.flight_keys', []] },
               as: 'fk',
               in: {
                 $convert: {
                   input: { $replaceAll: { input: '$$fk', find: 'SF_', replacement: '' } },
                   to: 'objectId',
                   onError: null,
                   onNull: null
                 }
               }
             }
           }
         }
      },
      {
        $lookup: {
          from: 'seriesfares',
          localField: 'cleanFlightKeys',
          foreignField: '_id',
          as: 'seriesFares'
        }
      },
      {
        $match: {
          'seriesFares.supplierId': new mongoose.Types.ObjectId(supplierId)
        }
      }
    ];

    const countResult = await Booking.aggregate([...matchPipeline, { $count: 'total' }]);
    const totalRecords = countResult[0]?.total || 0;

    const bookings = await Booking.aggregate([
      ...matchPipeline,
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
         $addFields: {
            seriesFareInfo: { $arrayElemAt: ['$seriesFares', 0] }
         }
      },
      {
         $project: {
           cleanFlightKeys: 0,
           seriesFares: 0,
           'user.password': 0
         }
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);

    res.json({
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
      currentPage: page,
      limit,
      data: bookings
    });
  } catch (error: any) {
    console.error('Supplier booking history error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getSeriesFareQueue = async (req: AuthRequest, res: Response) => {
  try {
    const mongoose = require('mongoose');
    const supplierId = req.user?._id;
    const { refNo, pnr, status, fromDate, toDate } = req.query;

    const Booking = require('../bookings/booking.model').default;
    
    const queueFilter: any = { type: 'FLIGHT' };

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

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const matchPipeline = [
      { $match: queueFilter },
      { 
         $addFields: {
           cleanFlightKeys: {
             $map: {
               input: { $ifNull: ['$details.flight_keys', []] },
               as: 'fk',
               in: {
                 $convert: {
                   input: { $replaceAll: { input: '$$fk', find: 'SF_', replacement: '' } },
                   to: 'objectId',
                   onError: null,
                   onNull: null
                 }
               }
             }
           }
         }
      },
      {
        $lookup: {
          from: 'seriesfares',
          localField: 'cleanFlightKeys',
          foreignField: '_id',
          as: 'seriesFares'
        }
      },
      {
        $match: {
          'seriesFares.supplierId': new mongoose.Types.ObjectId(supplierId)
        }
      }
    ];

    const countResult = await Booking.aggregate([...matchPipeline, { $count: 'total' }]);
    const totalRecords = countResult[0]?.total || 0;

    const queueItems = await Booking.aggregate([
      ...matchPipeline,
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
         $addFields: {
            seriesFareInfo: { $arrayElemAt: ['$seriesFares', 0] }
         }
      },
      {
         $project: {
           cleanFlightKeys: 0,
           seriesFares: 0,
           'user.password': 0
         }
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);

    res.json({
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
      currentPage: page,
      limit,
      data: queueItems
    });
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
