import { Request, Response } from 'express';
import { OfflineBooking } from '../bookings/offlineBooking.model';
import { TaxInvoice } from '../bookings/invoice.model';
import { GstInvoice } from '../wallet/gstInvoice.model';
import { CreditNote } from '../wallet/creditNote.model';
import { DebitNote } from '../wallet/debitNote.model';
import { Markup } from '../agents/markup.model';
import { BankDetails } from '../agents/bankDetails.model';

export const getAllOfflineBookings = async (req: Request, res: Response) => {
  try {
    const data = await OfflineBooking.find().populate('agentId', 'name companyName email').sort({ createdAt: -1 }).lean();
    res.json(data);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
};
export const updateOfflineBookingStatus = async (req: Request, res: Response) => {
  try {
    const updated = await OfflineBooking.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json(updated);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
};

export const getAllTaxInvoices = async (req: Request, res: Response) => {
  try {
    const data = await TaxInvoice.find().populate('agentId', 'name companyName email').sort({ createdAt: -1 }).lean();
    res.json(data);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
};
export const updateTaxInvoiceStatus = async (req: Request, res: Response) => {
  try {
    const updated = await TaxInvoice.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json(updated);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
};

export const getAllGstInvoices = async (req: Request, res: Response) => {
  try {
    const data = await GstInvoice.find().populate('agentId', 'name companyName email').sort({ createdAt: -1 }).lean();
    res.json(data);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
};
export const updateGstInvoiceStatus = async (req: Request, res: Response) => {
  try {
    const updated = await GstInvoice.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json(updated);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
};

export const getAllCreditNotes = async (req: Request, res: Response) => {
  try {
    const data = await CreditNote.find().populate('agentId', 'name companyName email').sort({ createdAt: -1 }).lean();
    res.json(data);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
};
export const updateCreditNoteStatus = async (req: Request, res: Response) => {
  try {
    const updated = await CreditNote.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json(updated);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
};

export const getAllDebitNotes = async (req: Request, res: Response) => {
  try {
    const data = await DebitNote.find().populate('agentId', 'name companyName email').sort({ createdAt: -1 }).lean();
    res.json(data);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
};
export const updateDebitNoteStatus = async (req: Request, res: Response) => {
  try {
    const updated = await DebitNote.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json(updated);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
};

export const getAllMarkups = async (req: Request, res: Response) => {
  try {
    const data = await Markup.find().populate('agentId', 'name companyName email').sort({ createdAt: -1 }).lean();
    res.json(data);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
};
export const updateMarkupStatus = async (req: Request, res: Response) => {
  try {
    const updated = await Markup.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json(updated);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
};

export const getAllBankDetails = async (req: Request, res: Response) => {
  try {
    const data = await BankDetails.find().populate('agentId', 'name companyName email').sort({ createdAt: -1 }).lean();
    res.json(data);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
};
export const updateBankDetailsStatus = async (req: Request, res: Response) => {
  try {
    const updated = await BankDetails.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json(updated);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
};
