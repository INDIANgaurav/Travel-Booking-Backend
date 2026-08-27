import { Request, Response } from 'express';
import Transaction from './wallet.model'; 

export const getAccountStatement = async (req: Request, res: Response) => {
  try {
    const requestingUser = (req as any).user;
    let agentId = requestingUser.id;

    // If an Admin requests a specific user's statement
    if (requestingUser.roles?.includes('SUPER_ADMIN') || requestingUser.roles?.includes('SUB_ADMIN')) {
      if (req.query.userId) {
        agentId = req.query.userId as string;
      }
    }

    const filter: any = {};
    if (agentId !== 'ALL') {
      filter.user = agentId;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = ((req.query.search as string) || '').toLowerCase();
    const fromDateStr = req.query.fromDate as string;
    const toDateStr = req.query.toDate as string;
    const month = req.query.month as string;
    const year = parseInt(req.query.year as string);
    const type = req.query.type as string;


    if (fromDateStr && toDateStr) {
      const from = new Date(fromDateStr);
      from.setUTCHours(0, 0, 0, 0);
      const to = new Date(toDateStr);
      to.setUTCHours(23, 59, 59, 999);
      filter.date = { $gte: from, $lte: to };
    } else if (month && year) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const monthIndex = monthNames.indexOf(month);
      if (monthIndex !== -1) {
        const from = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
        const to = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
        filter.date = { $gte: from, $lte: to };
      }
    }
    
    // If mini statement, we can restrict date to last 30 days or just rely on the pagination limit.
    // The frontend sends type=mini, we will just use the limit provided (default 10).

    if (search) {
      filter.$or = [
        { referenceNo: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { pnr: { $regex: search, $options: 'i' } }
      ];

      // Support searching by the auto-generated reference number (last 6 chars of _id)
      if (/^[a-fA-F0-9]+$/.test(search)) {
        filter.$or.push({
          $expr: {
            $regexMatch: {
              input: { $toString: '$_id' },
              regex: search,
              options: 'i'
            }
          }
        });
      }
    }

    const totalRecords = await Transaction.countDocuments(filter);

    // Fetch only the paginated transactions (Latest first)
    const paginatedTxns = await Transaction.find(filter)
      .populate('user', 'name firstName lastName companyName email')
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Calculate true running balance efficiently
    paginatedTxns.reverse(); // Oldest to Newest for sequential balance calculation
    const mongoose = require('mongoose');

    if (paginatedTxns.length > 0 && agentId !== 'ALL') {
      const oldestTxn = paginatedTxns[0];
      const newestTxn = paginatedTxns[paginatedTxns.length - 1];

      // 1. Get true opening balance before the oldest transaction in this page
      const initialBalanceAgg = await Transaction.aggregate([
        {
           $match: {
             user: new mongoose.Types.ObjectId(agentId),
             $or: [
               { date: { $lt: oldestTxn.date } },
               { date: oldestTxn.date, _id: { $lt: oldestTxn._id } }
             ]
           }
        },
        {
           $group: {
             _id: null,
             balance: { $sum: { $cond: [{ $eq: ['$type', 'CREDIT'] }, '$amount', { $multiply: ['$amount', -1] }] } }
           }
        }
      ]);
      
      let currentBalance = initialBalanceAgg[0]?.balance || 0;

      // 2. Fetch all intermediate transactions to calculate exact balance at each point
      const allTxnsInBetween = await Transaction.find({
        user: agentId,
        $or: [
          { date: { $gt: oldestTxn.date, $lt: newestTxn.date } },
          { date: oldestTxn.date, _id: { $gte: oldestTxn._id } },
          { date: newestTxn.date, _id: { $lte: newestTxn._id } }
        ]
      }).sort({ date: 1 }).select('_id amount type').lean();

      let pageTxnIndex = 0;
      for (const txn of allTxnsInBetween) {
         if (txn.type === 'CREDIT') currentBalance += txn.amount;
         else currentBalance -= txn.amount;
         
         if (pageTxnIndex < paginatedTxns.length && paginatedTxns[pageTxnIndex]._id.toString() === txn._id.toString()) {
            (paginatedTxns[pageTxnIndex] as any).runningBalance = currentBalance;
            pageTxnIndex++;
         }
      }
    }

    paginatedTxns.reverse(); // Revert back to Latest first

    // Fetch related bookings to get actual airline PNR
    const bookingIds = paginatedTxns.map((t: any) => t.pnr).filter(Boolean);
    const Booking = require('../bookings/booking.model').default;
    const relatedBookings = await Booking.find({ bookingId: { $in: bookingIds } }, 'bookingId details status').lean();
    
    const bookingMap = new Map();
    relatedBookings.forEach((b: any) => {
      let mainPassenger = '—';
      if (b.details?.passengers && b.details.passengers.length > 0) {
        mainPassenger = b.details.passengers[0].name || b.details.passengers[0].first_name || '—';
      }
      const bookingMobile = b.details?.contactDetails?.phone;

      const isFailed = b.status === 'FAILED' || b.status === 'FAILED_REFUNDING' || b.status === 'CANCELLED';
      bookingMap.set(b.bookingId, {
        pnr: isFailed ? '—' : (b.details?.pnr || '—'),
        passengerName: mainPassenger,
        mobileNumber: bookingMobile
      });
    });

    // Map to frontend expected format
    const mappedData = paginatedTxns.map((txn: any, idx: number) => {
      const isCredit = txn.type === 'CREDIT';
      
      const userObj = txn.user || {};
      const actualUserName = userObj.name || (userObj.firstName ? `${userObj.firstName} ${userObj.lastName || ''}`.trim() : userObj.companyName) || 'Unknown User';
      const actualMobile = userObj.mobile || userObj.phone || '—';

      return {
        sNo: ((page - 1) * limit) + idx + 1, 
        userName: actualUserName,
        referenceNo: txn.referenceNo || txn._id.toString().substring(18).toUpperCase(),
        bookingId: txn.pnr || '—', 
        airlinePnr: bookingMap.get(txn.pnr)?.pnr || '—',
        productName: txn.productName || (txn.description.toLowerCase().includes('topup') ? 'Wallet TopUp' : 'Service'), 
        description: txn.description,
        passengerName: txn.passengerName || bookingMap.get(txn.pnr)?.passengerName || '—', 
        mobileNumber: bookingMap.get(txn.pnr)?.mobileNumber || actualMobile,
        dateTime: txn.date,
        grossAmount: txn.grossAmount || (isCredit ? 0 : txn.amount),
        markup: txn.markup || 0,
        commission: txn.commission || 0,
        tds: txn.tds || 0,
        sgst: txn.sgst || 0,
        cgst: txn.cgst || 0,
        igst: txn.igst || 0,
        penalty: txn.penalty || 0,
        credit: isCredit ? txn.amount : 0,
        netAmountDebited: txn.netAmountDebited || (!isCredit ? txn.amount : 0),
        promoAmount: txn.promoAmount || 0,
        amount: txn.amount,
        userRemarks: txn.paymentMethod || '',
        balance: txn.runningBalance || 0
      };
    });

    res.status(200).json({
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
      currentPage: page,
      limit,
      data: mappedData
    });

  } catch (error) {
    console.error('Error fetching account statement:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
