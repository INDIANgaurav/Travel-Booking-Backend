import { Request, Response } from 'express';
import Booking from '../bookings/booking.model';
import WalletTransaction from '../wallet/wallet.model';
import User from '../users/user.model';
import mongoose from 'mongoose';
import fs from 'fs';

// 1. Flight Sales Report
export const getFlightSales = async (req: Request, res: Response) => {
  try {
    const { fromDate, toDate, searchBy, searchQuery, limit = 10, page = 1 } = req.query;
    
    let matchStage: any = { type: 'FLIGHT' };
    
    if (fromDate && toDate) {
      matchStage.createdAt = { 
        $gte: new Date(fromDate as string), 
        $lte: new Date(toDate as string) 
      };
    }
    
    if (searchQuery && searchBy === 'PNR') {
      matchStage['details.pnr'] = { $regex: searchQuery, $options: 'i' };
    } else if (searchQuery) {
      matchStage['bookingId'] = { $regex: searchQuery, $options: 'i' };
    }

    const pipeline = [
      { $match: matchStage },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'agent' } },
      { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
      { $sort: { createdAt: -1 as const } },
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) },
      { $project: {
          id: '$_id',
          status: '$status',
          basefare: '$details.total_price',
          tax: { $ifNull: ['$details.tax', 0] }, 
          comm: { $ifNull: ['$details.commission', 0] }, 
          gstComm: { $ifNull: ['$details.gstComm', 0] }, 
          tdsComm: { $ifNull: ['$details.tdsComm', 0] }, 
          mf: { $ifNull: ['$details.mf', 0] }, 
          gstMf: { $ifNull: ['$details.gstMf', 0] }, 
          yq: { $ifNull: ['$details.yq', 0] }, 
          tfee: { $ifNull: ['$details.tfee', 0] }, 
          markup: { $ifNull: ['$details.markup', 0] }, 
          additionalMarkup: { $ifNull: ['$details.additionalMarkup', 0] },
          invoiceTotal: '$totalAmount',
          paymode: { $ifNull: ['$paymentMethod', 'RAZORPAY'] },
          channel: { $ifNull: ['$details.api_source', 'API'] },
          journeyType: { $cond: [{ $eq: ['$details.from', '$details.to'] }, 'Roundtrip', 'Oneway'] },
          ticket: '$bookingId',
          email: { $ifNull: ['$details.contactDetails.email', ''] },
          txid: { $ifNull: ['$razorpayPaymentId', ''] },
          sf: { $ifNull: ['$details.sf', 0] },
          fareType: { $ifNull: ['$details.fareType', ''] },
          remarks: { $ifNull: ['$details.remarks', ''] }
      }}
    ];

    const data = await Booking.aggregate(pipeline);
    const total = await Booking.countDocuments(matchStage);

    return res.status(200).json({ success: true, data, total });
  } catch (error: any) {
    console.error(error);
    fs.appendFileSync('error.log', error.stack + '\n');
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 2. Cancellation History
export const getCancellations = async (req: Request, res: Response) => {
  try {
    const { fromDate, toDate, searchBy, searchQuery, limit = 50, page = 1 } = req.query;
    
    let matchStage: any = { type: 'FLIGHT', status: 'CANCELLED' };
    
    if (fromDate && toDate) {
      const from = new Date(fromDate as string);
      from.setHours(0, 0, 0, 0);
      const to = new Date(toDate as string);
      to.setHours(23, 59, 59, 999);
      matchStage.cancelledAt = { $gte: from, $lte: to };
    }
    
    if (searchQuery && searchBy === 'PNR') {
      matchStage['details.pnr'] = { $regex: searchQuery, $options: 'i' };
    } else if (searchQuery) {
      matchStage['bookingId'] = { $regex: searchQuery, $options: 'i' };
    }

    const pipeline = [
      { $match: matchStage },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'agent' } },
      { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
      { $sort: { cancelledAt: -1 as const, createdAt: -1 as const } },
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) },
      { $project: {
          id: '$_id',
          txid: '$bookingId',
          action: { $literal: 'Select' },
          txdate: { $dateToString: { format: "%d-%b-%Y %H:%M", date: "$createdAt" } },
          agency: { $ifNull: ['$agent.name', 'Unknown Agency'] },
          pax: {
            $reduce: {
              input: '$details.passengers',
              initialValue: '',
              in: { $concat: ['$$value', { $cond: [{ $eq: ['$$value', ''] }, '', ', '] }, '$$this.name'] }
            }
          },
          sector: { $concat: [{ $ifNull: ['$details.from', 'N/A'] }, ' - ', { $ifNull: ['$details.to', 'N/A'] }] },
          jdate: '$date',
          totalAmt: { $concat: ['₹', { $toString: '$totalAmount' }] },
          refundAmt: { $concat: ['₹', { $toString: { $ifNull: ['$refundAmount', 0] } }] },
          journey: { $cond: [{ $eq: ['$details.from', '$details.to'] }, 'ROUND-TRIP', 'ONE-WAY'] },
          refundStatus: { $ifNull: ['$refundStatus', 'Pending'] },
          bookingStatus: '$status',
          canceledOn: { $dateToString: { format: "%d-%b-%Y", date: { $ifNull: ['$cancelledAt', '$createdAt'] } } },
          txnBy: { $ifNull: ['$paymentMethod', ''] },
          admr: { $ifNull: ['$details.admr', ''] },
          agr: { $ifNull: ['$details.agr', ''] },
          supplier: { $ifNull: ['$details.api_source', ''] }
      }}
    ];

    const data = await Booking.aggregate(pipeline);
    const total = await Booking.countDocuments(matchStage);

    return res.status(200).json({ success: true, data, total });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 3. Hotel Cancellations (Placeholder)
// 3. Hotel Cancellations
export const getHotelCancellations = async (req: Request, res: Response) => {
  try {
    const { fromDate, toDate, limit = 10, page = 1 } = req.query;
    
    let matchStage: any = { type: 'HOTEL', status: 'CANCELLED' };
    
    if (fromDate && toDate) {
      matchStage.cancelledAt = { 
        $gte: new Date(fromDate as string), 
        $lte: new Date(toDate as string) 
      };
    }

    const data = await Booking.aggregate([
      { $match: matchStage },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'agent' } },
      { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
      { $sort: { cancelledAt: -1 as const } },
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) },
      { $project: {
          id: '$_id',
          cancellationDate: { $dateToString: { format: "%Y-%m-%d", date: "$cancelledAt" } },
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          bookingId: '$bookingId',
          pnr: { $ifNull: ['$details.pnr', 'N/A'] },
          agentName: { $ifNull: ['$agent.companyName', '$agent.name'] },
          cancellationCharges: { $literal: 0 },
          refundStatus: '$refundStatus',
          remarks: { $ifNull: ['$cancellationReason', ''] },
          hotelCode: { $ifNull: ['$details.hotelId', ''] }
      }}
    ]);
    
    const total = await Booking.countDocuments(matchStage);

    return res.status(200).json({ success: true, data, total });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 4. Passenger Calendar
export const getPassengerCalendar = async (req: Request, res: Response) => {
  try {
    const { fromDate, toDate } = req.query;
    
    let matchStage: any = { type: 'FLIGHT', status: 'CONFIRMED' };
    
    if (fromDate && toDate) {
      matchStage['details.checkIn'] = { 
        $gte: fromDate, 
        $lte: toDate 
      }; // assuming date or travel date is stored in checkIn or flight details
      // But actually travel date is usually date
      matchStage.date = { 
        $gte: fromDate, 
        $lte: toDate 
      };
    }

    const data = await Booking.aggregate([
      { $match: matchStage },
      { $project: {
          date: '$date',
          pnr: { $ifNull: ['$details.pnr', 'N/A'] },
          sector: { $concat: [{ $ifNull: ['$details.from', 'N/A'] }, ' - ', { $ifNull: ['$details.to', 'N/A'] }] },
          pax: {
            $reduce: {
              input: '$details.passengers',
              initialValue: '',
              in: { $concat: ['$$value', { $cond: [{ $eq: ['$$value', ''] }, '', ', '] }, '$$this.name'] }
            }
          }
      }}
    ]);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 5. Debit Notes
export const getDebitNotes = async (req: Request, res: Response) => {
  try {
    const { fromDate, toDate, limit = 10, page = 1 } = req.query;
    
    let matchStage: any = { type: 'DEBIT' };
    
    if (fromDate && toDate) {
      matchStage.date = { 
        $gte: new Date(fromDate as string), 
        $lte: new Date(toDate as string) 
      };
    }

    const data = await WalletTransaction.aggregate([
      { $match: matchStage },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'agent' } },
      { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
      { $sort: { date: -1 as const } },
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) },
      { $project: {
          id: '$_id',
          date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          txid: '$_id',
          refId: '$referenceNo',
          pnr: '$pnr',
          type: '$description',
          debitBy: { $literal: 'Admin' },
          debitTo: '$agent.name',
          amount: '$amount',
          remarks: '$description',
          company: '$agent.companyName'
      }}
    ]);
    
    const total = await WalletTransaction.countDocuments(matchStage);

    return res.status(200).json({ success: true, data, total });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 6. Credit Notes
export const getCreditNotes = async (req: Request, res: Response) => {
  try {
    const { fromDate, toDate, limit = 10, page = 1 } = req.query;
    
    let matchStage: any = { type: 'CREDIT' };
    
    if (fromDate && toDate) {
      matchStage.date = { 
        $gte: new Date(fromDate as string), 
        $lte: new Date(toDate as string) 
      };
    }

    const data = await WalletTransaction.aggregate([
      { $match: matchStage },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'agent' } },
      { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
      { $sort: { date: -1 as const } },
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) },
      { $project: {
          id: '$_id',
          date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          txid: '$_id',
          refId: { $ifNull: ['$referenceNo', 'N/A'] },
          pnr: { $ifNull: ['$pnr', 'N/A'] },
          type: '$description',
          creditBy: { $literal: 'Admin' },
          creditTo: { $ifNull: ['$agent.companyName', '$agent.name'] },
          amount: '$amount',
          remarks: '$description'
      }}
    ]);
    
    const total = await WalletTransaction.countDocuments(matchStage);

    return res.status(200).json({ success: true, data, total });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 7. Payment Gateway Reports
export const getPgReports = async (req: Request, res: Response) => {
  try {
    const { fromDate, toDate, limit = 10, page = 1 } = req.query;
    
    // Using wallet transactions with razorpay specific fields
    let matchStage: any = { paymentMethod: 'RAZORPAY', razorpayPaymentId: { $exists: true } };
    
    if (fromDate && toDate) {
      matchStage.date = { 
        $gte: new Date(fromDate as string), 
        $lte: new Date(toDate as string) 
      };
    }

    const data = await WalletTransaction.aggregate([
      { $match: matchStage },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'agent' } },
      { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
      { $sort: { date: -1 as const } },
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) },
      { $project: {
          id: '$_id',
          date: { $dateToString: { format: "%Y-%m-%d %H:%M", date: "$date" } },
          amount: '$amount',
          pgCharge: { $literal: 0 }, // Adjust if you have PG charges stored
          totalAmount: '$amount', // Adjust if you have total after charges
          trackingId: '$razorpayOrderId',
          bankRefNo: '$razorpayPaymentId',
          orderStatus: { $literal: 'Success' },
          failureMessage: { $literal: '' },
          pgType: { $literal: 'RAZORPAY' },
          company: { $ifNull: ['$agent.companyName', '$agent.name'] }
      }}
    ]);
    
    const total = await WalletTransaction.countDocuments(matchStage);

    return res.status(200).json({ success: true, data, total });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 8. Agent Outstanding
export const getAgentOutstanding = async (req: Request, res: Response) => {
  try {
    const { searchQuery, limit = 10, page = 1 } = req.query;
    
    let matchStage: any = { roles: { $in: ['B2B_AGENT'] } };
    
    if (searchQuery) {
      matchStage['companyName'] = { $regex: searchQuery, $options: 'i' };
    }

    const data = await User.aggregate([
      { $match: matchStage },
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) },
      { $project: {
          id: '$_id',
          company: { $ifNull: ['$companyName', '$name'] },
          agentName: { $concat: ['$firstName', ' ', { $ifNull: ['$lastName', ''] }] },
          contact: {
            $concat: [
              { $ifNull: ['$email', ''] },
              ' / ',
              { $ifNull: ['$phone', ''] }
            ]
          },
          domain: { $ifNull: ['$extendedDomain', 'trippechalo.com'] },
          walletBalance: { $ifNull: ['$walletBalance', 0] },
          creditOutstanding: { $ifNull: ['$creditBalance', 0] }
      }}
    ]);
    
    const total = await User.countDocuments(matchStage);

    return res.status(200).json({ success: true, data, total });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 9. Agent Activation
export const getAgentActivation = async (req: Request, res: Response) => {
  try {
    const { limit = 10, page = 1 } = req.query;
    
    const matchStage: any = { roles: { $in: ['B2B_AGENT'] } };
    
    const data = await User.aggregate([
      { $match: matchStage },
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) },
      { $project: {
          id: '$_id',
          staffId: '$_id',
          name: '$name',
          mobile: '$phone',
          email: '$email',
          role: { $literal: 'B2B_AGENT' },
          status: '$agentStatus',
          cash: '$walletBalance',
          credit: '$creditBalance',
          branch: '$officeAddress',
          street: '$officeAddress',
          city: '$city',
          country: { $literal: 'India' },
          state: '$state',
          pin: '$pincode',
          landline: { $literal: '-' },
          fax: { $literal: '-' },
          creationDate: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
      }}
    ]);
    
    const total = await User.countDocuments(matchStage);

    return res.status(200).json({ success: true, data, total });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 10. Supplier Mapping
export const getSupplierMapping = async (req: Request, res: Response) => {
  try {
    const { searchQuery, limit = 10, page = 1 } = req.query;
    let matchStage: any = { roles: { $in: ['B2B_AGENT'] } };

    if (searchQuery) {
      matchStage['companyName'] = { $regex: searchQuery, $options: 'i' };
    }

    const data = await User.aggregate([
      { $match: matchStage },
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) },
      { $project: {
          id: '$_id',
          company: { 
            $concat: [
              { $ifNull: ['$companyName', '$name'] },
              ' (TRC', 
              { $substr: [{ $toString: '$_id' }, 20, 4] },
              ')'
            ]
          },
          contact: {
            $concat: [
              { $ifNull: ['$email', ''] },
              ' (',
              { $ifNull: ['$phone', ''] },
              ')'
            ]
          },
          domain: { $ifNull: ['$extendedDomain', 'trippechalo.com'] },
          plan: { $literal: 'SUP1307-TRC FD(ANY)' }
      }}
    ]);

    const total = await User.countDocuments(matchStage);
    return res.status(200).json({ success: true, data, total });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 11. Fare Quote Reports
export const getFareQuotes = async (req: Request, res: Response) => {
  try {
    const { fromDate, toDate, limit = 10, page = 1 } = req.query;
    
    let matchStage: any = {};
    
    if (fromDate && toDate) {
      matchStage.createdAt = { 
        $gte: new Date(fromDate as string), 
        $lte: new Date(toDate as string) 
      };
    }

    const data = await mongoose.model('RecentSearch').aggregate([
      { $match: matchStage },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'agent' } },
      { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
      { $sort: { createdAt: -1 as const } },
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) },
      { $project: {
          id: '$_id',
          time: { $dateToString: { format: "%Y-%m-%d %H:%M", date: "$createdAt" } },
          channel: { $literal: 'API/Web' },
          type: '$type',
          supplier: { $literal: 'N/A' },
          origin: { $ifNull: ['$from.code', ''] },
          destination: { $ifNull: ['$to.code', '$destination'] },
          agent: { $ifNull: ['$agent.companyName', '$agent.name'] }
      }}
    ]);
    
    const total = await mongoose.model('RecentSearch').countDocuments(matchStage);

    return res.status(200).json({ success: true, data, total });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 12. Agent Analytics
export const getAgentAnalytics = async (req: Request, res: Response) => {
  try {
    // 1. Get Top 5 Agents by Revenue
    const topAgents = await Booking.aggregate([
      { $match: { status: 'CONFIRMED' } },
      { $group: {
          _id: '$user',
          totalSales: { $sum: '$totalAmount' },
          totalCommission: { $sum: '$details.commission' },
          totalBookings: { $sum: 1 }
      }},
      { $sort: { totalSales: -1 as const } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'agentInfo' } },
      { $unwind: { path: '$agentInfo', preserveNullAndEmptyArrays: true } },
      { $project: {
          name: { $ifNull: ['$agentInfo.companyName', '$agentInfo.name'] },
          totalSales: 1,
          totalCommission: 1,
          totalBookings: 1
      }}
    ]);

    // 2. Get Daily Booking Trends (Last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const bookingTrends = await Booking.aggregate([
      { $match: { 
          status: 'CONFIRMED',
          createdAt: { $gte: thirtyDaysAgo }
      }},
      { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          amount: { $sum: '$totalAmount' },
          count: { $sum: 1 }
      }},
      { $sort: { _id: 1 as const } },
      { $project: {
          date: '$_id',
          amount: 1,
          count: 1,
          _id: 0
      }}
    ]);

    // 3. Get Summary Cards
    const summary = await Booking.aggregate([
      { $match: { status: 'CONFIRMED' } },
      { $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          totalCommission: { $sum: '$details.commission' },
          totalBookings: { $sum: 1 }
      }}
    ]);

    const activeAgentsCount = await User.countDocuments({ role: 'AGENT', isActive: true });

    return res.status(200).json({
      success: true,
      data: {
        topAgents,
        bookingTrends,
        summary: summary.length > 0 ? summary[0] : { totalRevenue: 0, totalCommission: 0, totalBookings: 0 },
        activeAgentsCount
      }
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
