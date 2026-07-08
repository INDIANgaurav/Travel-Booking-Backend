import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import RecentSearch from './search.model';
import Flight from '../inventory/flight.model';

// @desc    Get recent searches for user
// @route   GET /api/searches/recent
// @access  Private
export const getRecentSearches = async (req: AuthRequest, res: Response) => {
  try {
    const searches = await RecentSearch.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json(searches);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Save a recent search
// @route   POST /api/searches/recent
// @access  Private
export const saveRecentSearch = async (req: AuthRequest, res: Response) => {
  try {
    const searchData = {
      ...req.body,
      user: req.user._id,
    };

    const newSearch = await RecentSearch.create(searchData);
    res.status(201).json(newSearch);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Search Flights
// @route   GET /api/searches/flights
// @access  Public
export const searchFlights = async (req: AuthRequest, res: Response) => {
  try {
    const { from, to, date, cabinClass, passengers, stops, morningDeparture } = req.query;
    let query: any = {};
    
    // We DO NOT filter by from/to in the DB so that we can mock flights for ANY route
    if (cabinClass) query.cabinClass = cabinClass;
    if (passengers) query.availableSeats = { $gte: Number(passengers) };
    if (stops !== undefined && stops !== '') query.stops = Number(stops);
    
    let flights: any[] = await Flight.find(query).limit(100).lean();
    
    // For dummy purposes, we override the flight dates and routes
    // This allows the UI to always show flights no matter what date/route is selected
    if (flights.length > 0) {
      const targetDate = date ? new Date(date as string) : new Date();
      
      flights = flights.map((flight, idx) => {
        const depTime = new Date(flight.departureTime);
        const arrTime = new Date(flight.arrivalTime);
        
        depTime.setFullYear(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        
        const dayDiff = arrTime.getDate() - new Date(flight.departureTime).getDate();
        arrTime.setFullYear(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + dayDiff);
        
        return {
          ...flight,
          departureTime: depTime,
          arrivalTime: arrTime,
          departureAirportCode: from ? String(from) : flight.departureAirportCode,
          arrivalAirportCode: to ? String(to) : flight.arrivalAirportCode,
          departureCity: from ? String(from) : flight.departureCity,
          arrivalCity: to ? String(to) : flight.arrivalCity,
        };
      });
      
      if (morningDeparture === 'true') {
        flights = flights.filter(f => {
          const hour = f.departureTime.getHours();
          return hour >= 6 && hour < 12;
        });
      }
    }
    // Sort by price by default
    flights.sort((a, b) => a.price - b.price);

    res.json(flights);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Search Hotels
// @route   GET /api/searches/hotels
// @access  Public
export const searchHotels = async (req: AuthRequest, res: Response) => {
  try {
    const { location } = req.query;
    let query: any = {};
    if (location) query.location = new RegExp(location as string, 'i');
    
    const { Hotel } = require('../inventory/inventory.model');
    const hotels = await Hotel.find(query);
    res.json(hotels);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Search Buses
// @route   GET /api/searches/buses
// @access  Public
export const searchBuses = async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    let query: any = {};
    if (from) query.from = new RegExp(from as string, 'i');
    if (to) query.to = new RegExp(to as string, 'i');
    
    const { Bus } = require('../inventory/inventory.model');
    const buses = await Bus.find(query);
    res.json(buses);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
