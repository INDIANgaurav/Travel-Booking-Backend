import { Request, Response } from 'express';
import Transaction from './wallet.model'; // Assuming this is the transaction model
// Define the shape of our ledger data
import Booking from '../bookings/booking.model';

export const getAccountStatement = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = ((req.query.search as string) || '').toLowerCase();

    // Fetch real transactions for the logged-in agent
    const transactions = await Transaction.find({ user: agentId }).sort({ date: -1 });

    // Map them to the required ledger format
    // Since Transaction schema currently lacks PNR, Passenger etc, we leave them blank or map what we have
    let mappedData = transactions.map((txn, index) => {
      const isCredit = txn.type === 'CREDIT';
      
      return {
        sNo: 0, // will set later after filter
        referenceNo: txn._id.toString().substring(18).toUpperCase(), // last 6 chars as ref
        pnr: '—', // Not in transaction model yet
        productName: txn.description.includes('Topup') ? 'TopUp' : 'Service', // Infer product from desc
        description: txn.description,
        passengerName: '—', 
        dateTime: txn.date,
        grossAmount: isCredit ? 0 : txn.amount,
        markup: 0,
        commission: 0,
        tds: 0,
        sgst: 0,
        cgst: 0,
        igst: 0,
        penalty: 0,
        credit: isCredit ? txn.amount : 0,
        netAmountDebited: isCredit ? 0 : txn.amount,
        promoAmount: 0,
        amount: txn.amount,
        userRemarks: txn.paymentMethod || '',
        balance: 0 // We'd need a running balance logic, but keeping 0 for now unless fetched
      };
    });

    // Filter by search term
    if (search) {
      mappedData = mappedData.filter(
        item => 
          item.referenceNo.toLowerCase().includes(search) ||
          item.description.toLowerCase().includes(search)
      );
    }
    
    // Assign S.No
    mappedData.forEach((item, idx) => {
      item.sNo = idx + 1;
    });

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedData = mappedData.slice(startIndex, endIndex);

    res.status(200).json({
      totalRecords: mappedData.length,
      totalPages: Math.ceil(mappedData.length / limit),
      currentPage: page,
      limit,
      data: paginatedData
    });

  } catch (error) {
    console.error('Error fetching account statement:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
