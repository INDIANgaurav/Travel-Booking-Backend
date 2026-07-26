import { Request, Response } from 'express';
import { TaxInvoice } from './invoice.model';

export const requestTaxInvoice = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const { product, fromDate, toDate } = req.body;

    const newInvoice = new TaxInvoice({
      agentId,
      product,
      fromDate,
      toDate,
    });

    const savedInvoice = await newInvoice.save();
    res.status(201).json({ message: 'Tax Invoice request submitted successfully', invoice: savedInvoice });
  } catch (error) {
    console.error('Error submitting tax invoice:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getTaxInvoices = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const invoices = await TaxInvoice.find({ agentId }).sort({ createdAt: -1 });
    res.status(200).json(invoices);
  } catch (error) {
    console.error('Error fetching tax invoices:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
