import { Request, Response } from 'express';
import Transaction from './wallet.model'; 

export const getAccountStatement = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = ((req.query.search as string) || '').toLowerCase();
    const fromDateStr = req.query.fromDate as string;
    const toDateStr = req.query.toDate as string;

    const filter: any = { user: agentId };

    if (fromDateStr && toDateStr) {
      const from = new Date(fromDateStr);
      from.setUTCHours(0, 0, 0, 0);
      const to = new Date(toDateStr);
      to.setUTCHours(23, 59, 59, 999);
      filter.date = { $gte: from, $lte: to };
    }

    if (search) {
      filter.$or = [
        { referenceNo: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { pnr: { $regex: search, $options: 'i' } }
      ];
    }

    const totalRecords = await Transaction.countDocuments(filter);

    // Fetch only the paginated transactions (Latest first)
    const paginatedTxns = await Transaction.find(filter)
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Calculate true running balance efficiently
    paginatedTxns.reverse(); // Oldest to Newest for sequential balance calculation
    const mongoose = require('mongoose');

    if (paginatedTxns.length > 0) {
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

    // Map to frontend expected format
    const mappedData = paginatedTxns.map((txn: any, idx: number) => {
      const isCredit = txn.type === 'CREDIT';
      
      return {
        sNo: ((page - 1) * limit) + idx + 1, 
        referenceNo: txn.referenceNo || txn._id.toString().substring(18).toUpperCase(),
        pnr: txn.pnr || '—', 
        productName: txn.productName || (txn.description.toLowerCase().includes('topup') ? 'Wallet TopUp' : 'Service'), 
        description: txn.description,
        passengerName: txn.passengerName || '—', 
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
