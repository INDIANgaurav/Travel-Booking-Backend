import { Request, Response } from 'express';
import SeriesFare from '../seriesFare/seriesFare.model';

export const searchFlights = async (req: Request, res: Response) => {
  try {
    const { origin, destination, date, adults } = req.query;
    
    if (!origin || !destination || !date) {
      return res.status(400).json({ success: false, error: 'origin, destination, and date are required' });
    }

    const searchDate = new Date(date as string);
    const startOfDay = new Date(searchDate.setHours(0,0,0,0));
    const endOfDay = new Date(searchDate.setHours(23,59,59,999));

    const paxCount = adults ? parseInt(adults as string) : 1;

    const flights = await SeriesFare.find({
      status: 'Active',
      isArchived: false,
      origin: (origin as string).toUpperCase(),
      destination: (destination as string).toUpperCase(),
      travelDate: { $gte: startOfDay, $lte: endOfDay },
      availableSeats: { $gte: paxCount }
    });

    const markup = req.b2bClient.markupPercentage || 0;

    const results = flights.map(f => ({
      sfId: f.sfId,
      airline: f.airline,
      flightNo: f.flightNo,
      origin: f.origin,
      destination: f.destination,
      departureTime: f.departureTime,
      arrivalTime: f.arrivalTime,
      travelDate: f.travelDate,
      // Add client-specific markup to the net fare
      fare: f.adtFare + (f.adtFare * (markup / 100)),
      availableSeats: f.availableSeats,
      checkinBaggage: f.checkinBaggage,
      cabinBaggage: f.cabinBaggage,
      isRefundable: f.isRefundable
    }));

    res.json({ success: true, data: results });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const bookFlight = async (req: Request, res: Response) => {
  try {
    const { sfId, passengers } = req.body;
    
    if (!sfId || !passengers || !Array.isArray(passengers) || passengers.length === 0) {
      return res.status(400).json({ success: false, error: 'sfId and passengers array are required' });
    }

    const flight = await SeriesFare.findOne({ sfId, status: 'Active', isArchived: false });
    if (!flight) {
      return res.status(404).json({ success: false, error: 'Flight not found or inactive' });
    }

    if (flight.availableSeats < passengers.length) {
      return res.status(400).json({ success: false, error: 'Not enough seats available' });
    }

    const totalFare = flight.adtFare * passengers.length;

    if (req.isLiveMode) {
      if (req.b2bClient.apiWalletBalance < totalFare) {
        return res.status(402).json({ success: false, error: 'Insufficient API Wallet Balance. Please recharge.' });
      }

      // 1. Deduct Balance
      req.b2bClient.apiWalletBalance -= totalFare;
      await req.b2bClient.save();

      // 2. Deduct Seats
      flight.availableSeats -= passengers.length;
      if (flight.availableSeats === 0) flight.status = 'SoldOut';
      await flight.save();

      // 3. Generate PNR
      const pnr = `TC${Math.floor(100000 + Math.random() * 900000)}`;

      return res.json({
        success: true,
        data: {
          pnr,
          status: 'CONFIRMED',
          totalAmountDeducted: totalFare,
          passengers
        }
      });

    } else {
      // Test Mode (No seat deduction, no wallet deduction)
      return res.json({
        success: true,
        data: {
          pnr: `TEST-${Math.floor(100000 + Math.random() * 900000)}`,
          status: 'TEST_CONFIRMED',
          message: 'Booking successful in TEST mode. No seats or balance deducted.',
          passengers
        }
      });
    }

  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
