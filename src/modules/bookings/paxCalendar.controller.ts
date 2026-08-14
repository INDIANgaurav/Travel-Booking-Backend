import { Request, Response } from 'express';
import Booking from './booking.model';

export const getPaxCalendarStats = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ message: 'Month and year are required' });
    }

    // Since we do not have specific booking data for pax calendar right now,
    // we'll return an empty list or aggregate based on Booking model.
    // For now, let's just return a successful response with an empty array.
    // In production, we'd query: await Booking.find({ agentId, date: { $gte: start, $lte: end } }).lean()
    
    res.status(200).json({
      month,
      year,
      records: [],
      totalRecords: 0
    });
  } catch (error) {
    console.error('Error fetching pax calendar stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
