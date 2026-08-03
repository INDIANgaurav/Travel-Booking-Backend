import { Request, Response } from 'express';
import { TaxInvoice } from './invoice.model';
import Booking from './booking.model';

export const requestTaxInvoice = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const { product, fromDate, toDate } = req.body;

    // Auto-calculate logic
    const start = new Date(fromDate);
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    
    // Map product to booking type
    let bookingType = product.toUpperCase();
    if (bookingType === 'AIRLINE') bookingType = 'FLIGHT';

    const bookings = await Booking.find({
      user: agentId,
      status: 'CONFIRMED',
      type: bookingType,
      createdAt: { $gte: start, $lte: end }
    });

    let totalBookings = bookings.length;
    let totalSalesAmount = 0;
    let totalTaxes = 0;

    bookings.forEach(b => {
      totalSalesAmount += (b.totalAmount || 0);
      // Assuming a generic tax calculation for now (e.g. 5% of total, or could be fetched from details)
      // Since booking details don't explicitly separate tax in this schema, we use an approximation
      totalTaxes += ((b.totalAmount || 0) * 0.05); 
    });

    const newInvoice = new TaxInvoice({
      agentId,
      product,
      fromDate,
      toDate,
      totalBookings,
      totalSalesAmount,
      totalTaxes,
      currency: 'INR'
    });

    const savedInvoice = await newInvoice.save();
    res.status(201).json({ message: 'Tax Invoice auto-generated successfully', invoice: savedInvoice });
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

export const deleteTaxInvoice = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const deletedInvoice = await TaxInvoice.findOneAndDelete({ _id: req.params.id, agentId });
    if (!deletedInvoice) {
      return res.status(404).json({ message: 'Invoice not found or unauthorized' });
    }
    res.status(200).json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Error deleting tax invoice:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
