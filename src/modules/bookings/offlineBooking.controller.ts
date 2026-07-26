import { Request, Response } from 'express';
import { OfflineBooking } from './offlineBooking.model';

export const submitOfflineBooking = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const data = req.body;

    const newBooking = new OfflineBooking({
      agentId,
      ...data,
    });

    const savedBooking = await newBooking.save();
    res.status(201).json({ message: 'Offline booking request submitted successfully', booking: savedBooking });
  } catch (error) {
    console.error('Error submitting offline booking:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getOfflineBookings = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const bookings = await OfflineBooking.find({ agentId }).sort({ createdAt: -1 });
    res.status(200).json(bookings);
  } catch (error) {
    console.error('Error fetching offline bookings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
