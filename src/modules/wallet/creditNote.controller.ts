import { Request, Response } from 'express';
import { CreditNote } from './creditNote.model';

export const requestCreditNote = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const { product, fromDate, toDate } = req.body;

    const newCreditNote = new CreditNote({
      agentId,
      product,
      fromDate,
      toDate,
    });

    const savedCreditNote = await newCreditNote.save();
    res.status(201).json({ message: 'Credit Note request submitted successfully', creditNote: savedCreditNote });
  } catch (error) {
    console.error('Error submitting credit note:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getCreditNotes = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const creditNotes = await CreditNote.find({ agentId }).sort({ createdAt: -1 });
    res.status(200).json(creditNotes);
  } catch (error) {
    console.error('Error fetching credit notes:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
