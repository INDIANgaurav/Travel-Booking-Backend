import { Request, Response } from 'express';
import Booking from './booking.model';
import { AuthRequest } from '../../middleware/auth.middleware';

export const getManageBookings = async (req: AuthRequest, res: Response) => {
  try {
    const agentId = req.user?._id;
    const userRole = req.user?.role;
    const { product, searchType, status, fromDate, toDate, month, year, searchOption, searchValue } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const query: any = {};
    
    if (userRole === 'USER' || userRole === 'B2B_AGENT') {
      // Users and Travel Agents see only bookings they created
      query.user = agentId;
    } else if (userRole === 'SUPPLIER_AGENT') {
      // Logic moved to aggregation pipeline below
    }

    if (product) {
      if (product === 'UMRAH Packages') {
        query.type = 'PACKAGE';
      } else if (product === 'Travel Insurance') {
        query.type = 'INSURANCE'; 
      } else {
        query.type = (product as string).toUpperCase();
      }
    }

    if (status) {
      if (status === 'LIVE BOOKING') query.status = 'CONFIRMED';
      else if (status === 'HOLD BOOKING') query.status = 'PENDING';
      else if (status === 'CANCELLED BOOKING') query.status = 'CANCELLED';
    }

    if (searchType === 'SEARCH BY DATE' && fromDate && toDate) {
      const from = new Date(fromDate as string);
      from.setHours(0, 0, 0, 0);
      const to = new Date(toDate as string);
      to.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: from, $lte: to };
    } 
    else if (searchType === 'SEARCH BY MONTH' && month && year) {
      const monthMap: Record<string, number> = {
        'January': 0, 'February': 1, 'March': 2, 'April': 3,
        'May': 4, 'June': 5, 'July': 6, 'August': 7,
        'September': 8, 'October': 9, 'November': 10, 'December': 11
      };
      const monthIdx = monthMap[month as string] ?? 6;
      const yearNum = parseInt(year as string);
      const startDate = new Date(yearNum, monthIdx, 1);
      const endDate = new Date(yearNum, monthIdx + 1, 0, 23, 59, 59, 999);
      query.createdAt = { $gte: startDate, $lte: endDate };
    }
    else if (searchType === 'SEARCH BY OPTIONS' && searchOption && searchValue) {
      if (searchOption === 'RefNo') {
        query.bookingId = { $regex: searchValue as string, $options: 'i' };
      } else if (searchOption === 'AirlinePNR') {
        query['details.pnr'] = { $regex: searchValue as string, $options: 'i' };
      } else if (searchOption === 'Passenger Mobile') {
        query['details.contactDetails.phone'] = { $regex: searchValue as string, $options: 'i' };
      } else if (searchOption === 'Passenger Name') {
        query['details.passengers.name'] = { $regex: searchValue as string, $options: 'i' };
      } else if (searchOption === 'Ticket Number') {
        query.bookingId = { $regex: searchValue as string, $options: 'i' };
      }
    }

    let bookings = [];
    let totalRecords = 0;

    if (userRole === 'SUPPLIER_AGENT') {
      const mongoose = require('mongoose');
      
      const matchPipeline = [
        { $match: query },
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
            $or: [
              { user: new mongoose.Types.ObjectId(agentId) },
              { 'seriesFares.supplierId': new mongoose.Types.ObjectId(agentId) }
            ]
          }
        }
      ];

      // Get Total Count
      const countResult = await Booking.aggregate([...matchPipeline, { $count: 'total' }]);
      totalRecords = countResult[0]?.total || 0;

      // Get Paginated Data
      bookings = await Booking.aggregate([
        ...matchPipeline,
        {
           $project: {
             cleanFlightKeys: 0,
             seriesFares: 0
           }
        },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit }
      ]);
    } else {
      totalRecords = await Booking.countDocuments(query);
      bookings = await Booking.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
    }

    res.status(200).json({
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
      currentPage: page,
      limit,
      data: bookings
    });
  } catch (error) {
    console.error('Error fetching manage bookings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
