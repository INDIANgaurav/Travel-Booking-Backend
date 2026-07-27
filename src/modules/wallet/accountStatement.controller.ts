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

    // Fetch transactions in chronological order to calculate running balance
    const transactions = await Transaction.find(filter).sort({ date: 1 });

    let currentBalance = 0;
    let mappedData = transactions.map((txn) => {
      const isCredit = txn.type === 'CREDIT';
      
      // Calculate running balance
      if (isCredit) {
        currentBalance += txn.amount;
      } else {
        currentBalance -= txn.amount;
      }

      return {
        sNo: 0, 
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
        balance: currentBalance
      };
    });

    // Reverse to show latest first
    mappedData.reverse();

    // Filter by search term
    if (search) {
      mappedData = mappedData.filter(
        item => 
          item.referenceNo.toLowerCase().includes(search) ||
          item.description.toLowerCase().includes(search) ||
          item.pnr.toLowerCase().includes(search)
      );
    }
    
    // Assign S.No based on new order
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
