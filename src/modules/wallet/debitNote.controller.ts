import { Request, Response } from 'express';
import { DebitNote } from './debitNote.model';

export const requestDebitNote = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const { product, fromDate, toDate } = req.body;

    const newDebitNote = new DebitNote({
      agentId,
      product,
      fromDate,
      toDate,
    });

    const savedDebitNote = await newDebitNote.save();
    res.status(201).json({ message: 'Debit Note request submitted successfully', debitNote: savedDebitNote });
  } catch (error) {
    console.error('Error submitting debit note:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getDebitNotes = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const debitNotes = await DebitNote.find({ agentId }).sort({ createdAt: -1 });
    res.status(200).json(debitNotes);
  } catch (error) {
    console.error('Error fetching debit notes:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
