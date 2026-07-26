import { Request, Response } from 'express';
import { GstInvoice } from './gstInvoice.model';

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
    const invoices = await GstInvoice.find({ agentId }).sort({ createdAt: -1 });
    res.status(200).json(invoices);
  } catch (error) {
    console.error('Error fetching GST invoices:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
