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
    const filter: any = { isArchived: { $ne: true } };

    // Strict Data Isolation: ID-based linking
    if (req.user?.roles?.includes('SUPPLIER_AGENT') || req.user?.roles?.includes('SUPPLIER_STAFF')) {
      filter.supplierId = req.user.roles.includes('SUPPLIER_STAFF') ? req.user.supplierOwnerId : req.user._id;
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
    let supplierId = req.user?.role === 'SUPPLIER_STAFF' ? req.user?.supplierOwnerId : req.user?._id;
    
    // If admin, they can pass specific supplierId from query
    if (req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'SUB_ADMIN') {
        if (req.query.supplierId && req.query.supplierId !== 'ALL' && req.query.supplierId !== '') {
            supplierId = req.query.supplierId;
        }
    }

    const { timeFilter } = req.query;
    let dateFilter: any = {};
    if (timeFilter) {
      const now = new Date();
      if (timeFilter === 'Day') {
        const start = new Date(now.setHours(0, 0, 0, 0));
        const end = new Date(now.setHours(23, 59, 59, 999));
        dateFilter = { $gte: start, $lte: end };
      } else if (timeFilter === 'Week') {
        const start = new Date(now);
        start.setDate(now.getDate() - now.getDay() + 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        dateFilter = { $gte: start, $lte: end };
      } else if (timeFilter === 'Month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        dateFilter = { $gte: start, $lte: end };
      } else if (timeFilter === 'Quarter') {
        const quarter = Math.floor(now.getMonth() / 3);
        const start = new Date(now.getFullYear(), quarter * 3, 1);
        const end = new Date(now.getFullYear(), (quarter + 1) * 3, 0, 23, 59, 59, 999);
        dateFilter = { $gte: start, $lte: end };
      } else if (timeFilter === 'Year') {
        const start = new Date(now.getFullYear(), 0, 1);
        const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        dateFilter = { $gte: start, $lte: end };
      } else if (timeFilter === 'Custom') {
        const { fromDate, toDate } = req.query;
        if (fromDate && toDate) {
          const start = new Date(fromDate as string);
          start.setHours(0, 0, 0, 0);
          const end = new Date(toDate as string);
          end.setHours(23, 59, 59, 999);
          dateFilter = { $gte: start, $lte: end };
        }
      }
    }

    const faresQuery: any = { status: 'Active' };
    if (supplierId && supplierId !== 'ALL') faresQuery.supplierId = supplierId;
    // We could filter active fares count by creation date, but usually "Active Fares" means currently active regardless of creation date.
    // Keeping faresCount as overall active fares for this supplier.
    const faresCount = await SeriesFare.countDocuments(faresQuery);
    
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

    const matchStage: any = { type: 'FLIGHT' };
    if (Object.keys(dateFilter).length > 0) {
      matchStage.createdAt = dateFilter;
    }

    const aggResult = await Booking.aggregate([
      { $match: matchStage },
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
        $match: (supplierId && supplierId !== 'ALL') ? {
          'seriesFares.supplierId': new mongoose.Types.ObjectId(supplierId)
        } : { 'seriesFares.0': { $exists: true } }
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

export const bulkUploadSeriesFares = async (req: AuthRequest, res: Response) => {
  try {
    const fares = JSON.parse(req.body.fares || '[]');
    if (!fares.length) return res.status(400).json({ message: 'No fares provided' });

    const bulkOps = fares.map((fare: any) => {
      const sfId = fare.sfId || Math.random().toString(36).substr(2, 9);
      const updateDoc: any = { ...fare };
      if (req.user) {
        updateDoc.supplierId = req.user._id;
        updateDoc.supplierName = req.user.companyName || req.user.name || 'PJ HOLIDAY BOOKERS';
      }
      return {
        updateOne: {
          filter: { sfId },
          update: { $set: updateDoc },
          upsert: true
        }
      };
    });

    const result = await SeriesFare.bulkWrite(bulkOps);
    res.json({
      message: 'Bulk upload processed successfully',
      insertedCount: result.upsertedCount,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getFDManifest = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const seriesFare = await SeriesFare.findOne({ $or: [{ sfId: id }, { airlinePnr: id }] });
    if (!seriesFare) return res.status(404).json({ message: 'Fixed Departure not found' });

    const Booking = require('../bookings/booking.model').default;
    const searchKey = 'SF_' + seriesFare.sfId;
    const bookings = await Booking.find({
      status: 'CONFIRMED',
      'details.flight_keys': { $in: [searchKey, seriesFare.sfId] }
    });

    let manifest: any[] = [];
    bookings.forEach((booking: any) => {
      if (booking.details && booking.details.passengers) {
        booking.details.passengers.forEach((pax: any) => {
          manifest.push({
            id: Math.random().toString(36).substr(2, 9),
            title: pax.name.split(' ')[0] || '',
            gender: pax.gender || 'Unknown',
            firstName: pax.name.substring(pax.name.indexOf(' ') + 1) || pax.name,
            lastName: '',
            dob: pax.dob || '',
            type: pax.type || 'Adult',
            pnr: booking.details.pnr || booking.bookingId,
            ticketId: '',
            passportNo: pax.passportNum || '',
            passportExpiry: pax.passportExpiry || '',
            passportIssuance: '',
            remarks: booking.bookingId
          });
        });
      }
    });

    res.json({
      seriesFare: {
        flight: seriesFare.airline + ' - ' + seriesFare.flightNo,
        sector: seriesFare.origin + '-' + seriesFare.destination,
        travelDate: seriesFare.travelDate,
        pnr: seriesFare.airlinePnr
      },
      manifest
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getArchivedFares = async (req: AuthRequest, res: Response) => {
  try {
    const archives = await SeriesFare.find({ isArchived: true }).sort({ updatedAt: -1 });
    res.json(archives);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const toggleArchiveStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { isArchived } = req.body;
    const fare = await SeriesFare.findByIdAndUpdate(id, { isArchived }, { new: true });
    if (!fare) return res.status(404).json({ message: 'Not found' });
    res.json(fare);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getSlowMovingSectors = async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    nextWeek.setHours(23, 59, 59, 999);

    const sectors = await SeriesFare.find({
      status: 'Active',
      isArchived: { $ne: true },
      travelDate: { $gte: today, $lte: nextWeek }
    });

    const slowMoving = sectors.filter(sector => {
      const sold = sector.totalSeats - sector.availableSeats;
      const sellPercent = (sold / (sector.totalSeats || 1)) * 100;
      return sellPercent < 30;
    }).map(sector => {
      const sold = sector.totalSeats - sector.availableSeats;
      const sellPercent = (sold / (sector.totalSeats || 1)) * 100;
      const tDate = new Date(sector.travelDate);
      tDate.setHours(0, 0, 0, 0);
      const diffTime = tDate.getTime() - today.getTime();
      const daysToDeparture = Math.round(diffTime / (1000 * 60 * 60 * 24));
      return {
        id: sector._id,
        sfId: sector.sfId,
        airline: sector.airline,
        sector: sector.origin + ' - ' + sector.destination,
        travelDate: sector.travelDate,
        daysToDeparture,
        totalSeats: sector.totalSeats,
        soldSeats: sold,
        sellPercent: Math.round(sellPercent),
        pnr: sector.airlinePnr,
        price: sector.adtFare,
        supplierName: sector.supplierName
      };
    });
    slowMoving.sort((a, b) => a.daysToDeparture - b.daysToDeparture);
    res.json(slowMoving);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const bulkUpdateStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { ids, status } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'No IDs provided' });
    let query: any = { _id: { $in: ids } };
    if (req.user && !req.user.roles?.includes('SUPER_ADMIN')) {
      query.supplierId = req.user.roles?.includes('SUPPLIER_STAFF') ? req.user.supplierOwnerId : req.user._id;
    }
    await SeriesFare.updateMany(query, { $set: { status } });
    res.json({ message: 'Status updated successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const bulkArchiveFares = async (req: AuthRequest, res: Response) => {
  try {
    console.log('--- BULK ARCHIVE REQUEST ---', req.body);
    const { ids, isArchived } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'No IDs provided' });
    let query: any = { _id: { $in: ids } };
    if (req.user && !req.user.roles?.includes('SUPER_ADMIN')) {
      query.supplierId = req.user.roles?.includes('SUPPLIER_STAFF') ? req.user.supplierOwnerId : req.user._id;
    }
    console.log('--- BULK ARCHIVE QUERY ---', JSON.stringify(query));
    const updateResult = await SeriesFare.updateMany(query, { $set: { isArchived } });
    console.log('--- BULK ARCHIVE RESULT ---', updateResult);
    res.json({ message: 'Archive status updated successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const bulkModifyFares = async (req: AuthRequest, res: Response) => {
  try {
    const { ids, updates } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'No IDs provided' });
    let query: any = { _id: { $in: ids } };
    if (req.user && !req.user.roles?.includes('SUPER_ADMIN')) {
      query.supplierId = req.user.roles?.includes('SUPPLIER_STAFF') ? req.user.supplierOwnerId : req.user._id;
    }
    await SeriesFare.updateMany(query, { $set: updates });
    res.json({ message: 'Fares modified successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const bulkConnectFares = async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length < 2) return res.status(400).json({ message: 'Select at least 2 flights to connect' });
    const connectionId = 'CXN-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    let query: any = { _id: { $in: ids } };
    if (req.user && !req.user.roles?.includes('SUPER_ADMIN')) {
      query.supplierId = req.user.roles?.includes('SUPPLIER_STAFF') ? req.user.supplierOwnerId : req.user._id;
    }
    await SeriesFare.updateMany(query, { $set: { connectionId } });
    res.json({ message: 'Linked successfully under ' + connectionId });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const bulkDeleteFares = async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'No IDs provided' });
    let query: any = { _id: { $in: ids } };
    if (req.user && !req.user.roles?.includes('SUPER_ADMIN')) {
      query.supplierId = req.user.roles?.includes('SUPPLIER_STAFF') ? req.user.supplierOwnerId : req.user._id;
    }
    await SeriesFare.deleteMany(query);
    res.json({ message: 'Permanently deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const runAutoSync = async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let query: any = { status: 'Active', travelDate: { $lt: today } };
    if (req.user && !req.user.roles?.includes('SUPER_ADMIN')) {
      query.supplierId = req.user.roles?.includes('SUPPLIER_STAFF') ? req.user.supplierOwnerId : req.user._id;
    }
    const result = await SeriesFare.updateMany(query, { $set: { status: 'SoldOut' } });
    res.json({ message: 'Auto Sync Complete. Deactivated ' + result.modifiedCount + ' expired flights.' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const populateSectors = async (req: AuthRequest, res: Response) => {
  try {
    const dummySectors = [
      { origin: 'DEL', destination: 'BOM' },
      { origin: 'BOM', destination: 'BLR' },
      { origin: 'DEL', destination: 'GOI' }
    ];
    let query: any = { $or: [{ origin: '' }, { destination: '' }] };
    if (req.user && !req.user.roles?.includes('SUPER_ADMIN')) {
      query.supplierId = req.user.roles?.includes('SUPPLIER_STAFF') ? req.user.supplierOwnerId : req.user._id;
    }
    const faresToUpdate = await SeriesFare.find(query);
    let count = 0;
    for (let fare of faresToUpdate) {
      const randomSector = dummySectors[Math.floor(Math.random() * dummySectors.length)];
      fare.origin = fare.origin || randomSector.origin;
      fare.destination = fare.destination || randomSector.destination;
      await fare.save();
      count++;
    }
    res.json({ message: 'Sector population complete. Updated ' + count + ' records.' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get real-time seat map for a Series Fare flight
// @route   GET /api/series-fares/:id/seats  (public - no auth needed for checkout)
// @access  Public
export const getSeriesFareSeats = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Find by _id or sfId
    const sf = await SeriesFare.findOne({
      $or: [{ _id: id.length === 24 ? id : null }, { sfId: id }]
    }).select('totalSeats availableSeats sfId airlinePnr origin destination travelDate airline flightNo').lean() as any;

    if (!sf) return res.status(404).json({ message: 'Series Fare not found' });

    // Fetch all confirmed bookings for this SF flight to get booked seat numbers
    const Booking = require('../bookings/booking.model').default;
    const bookings = await Booking.find({
      status: { $in: ['CONFIRMED', 'TICKETING_IN_PROGRESS'] },
      'details.flight_keys': { $in: [`SF_${sf.sfId}`, sf.sfId, id] }
    }).select('details.seats').lean();

    // Collect all booked seat IDs
    const bookedSeats: string[] = [];
    bookings.forEach((b: any) => {
      if (b.details?.seats && Array.isArray(b.details.seats)) {
        bookedSeats.push(...b.details.seats);
      }
    });

    res.json({
      totalSeats: sf.totalSeats,
      availableSeats: sf.availableSeats,
      bookedSeats: [...new Set(bookedSeats)], // deduplicate
      sfInfo: {
        sfId: sf.sfId,
        airline: sf.airline,
        flightNo: sf.flightNo,
        origin: sf.origin,
        destination: sf.destination,
        travelDate: sf.travelDate,
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
