import { Request, Response } from 'express';
import { GstInvoice } from './gstInvoice.model';
import Transaction from './wallet.model';

export const submitGstInvoice = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const data = req.body;

    const newInvoice = new GstInvoice({
      agentId,
      ...data,
    });

    const savedInvoice = await newInvoice.save();
    res.status(201).json({ message: 'GST Invoice submitted successfully', invoice: savedInvoice });
  } catch (error) {
    console.error('Error submitting GST invoice:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getGstInvoices = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const invoices = await GstInvoice.find({ agentId }).sort({ createdAt: -1 }).lean();
    res.status(200).json(invoices);
  } catch (error) {
    console.error('Error fetching GST invoices:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const calculateGstInvoice = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ message: 'Month and year are required' });
    }

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const monthIndex = monthNames.indexOf(month as string);
    if (monthIndex === -1) {
      return res.status(400).json({ message: 'Invalid month provided' });
    }

    const yearNum = parseInt(year as string, 10);

    // First day of the selected month
    const startDate = new Date(Date.UTC(yearNum, monthIndex, 1, 0, 0, 0, 0));
    // Last day of the selected month
    const endDate = new Date(Date.UTC(yearNum, monthIndex + 1, 0, 23, 59, 59, 999));

    // Fetch all transactions for this agent in this date range
    const transactions = await Transaction.find({
      user: agentId,
      date: { $gte: startDate, $lte: endDate }
    }).lean();

    let totalCommission = 0;
    transactions.forEach(txn => {
      totalCommission += (txn.commission || 0);
    });

    // Assume 18% IGST on the total commission
    const taxableValue = Math.round(totalCommission);
    const igst = Math.round(taxableValue * 0.18);
    const cgst = 0;
    const sgst = 0;
    const totalAmount = taxableValue + igst + cgst + sgst;

    res.status(200).json({
      taxableValue,
      igst,
      cgst,
      sgst,
      totalAmount
    });

  } catch (error) {
    console.error('Error calculating GST invoices:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
