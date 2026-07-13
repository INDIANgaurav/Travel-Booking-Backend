import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import RecentSearch from './search.model';
import Flight from '../inventory/flight.model';
import { Duffel } from '@duffel/api';

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
// Helper function to map common city names to IATA codes
const getIataCode = (cityName: string): string => {
  if (!cityName) return '';
  const city = cityName.trim().toLowerCase();
  const map: Record<string, string> = {
    'new delhi': 'DEL',
    'delhi': 'DEL',
    'mumbai': 'BOM',
    'bengaluru': 'BLR',
    'bangalore': 'BLR',
    'chennai': 'MAA',
    'kolkata': 'CCU',
    'hyderabad': 'HYD',
    'pune': 'PNQ',
    'goa': 'GOI',
    'london': 'LHR',
    'new york': 'JFK',
    'dubai': 'DXB',
    'singapore': 'SIN'
  };
  return map[city] || cityName.toUpperCase().substring(0, 3);
};

export const searchFlights = async (req: AuthRequest, res: Response) => {
  try {
    const { from, to, date, cabinClass, passengers, stops, morningDeparture } = req.query;
    console.log("✈️ Flight Search Request Received:", req.query);
    
    const originIata = getIataCode(from as string);
    const destinationIata = getIataCode(to as string);
    
    const duffel = new Duffel({
      token: process.env.DUFFEL_ACCESS_TOKEN || ''
    });
    
    // Default to economy if not specified, and map frontend strings to Duffel enum
    let cabin = 'economy';
    if (cabinClass) {
      const cc = (cabinClass as string).toLowerCase();
      if (cc.includes('premium')) cabin = 'premium_economy';
      else if (cc.includes('business')) cabin = 'business';
      else if (cc.includes('first')) cabin = 'first';
    }
    const adultCount = Number(passengers) || 1;
    
    // Create an array of passengers based on count
    const passengerArray = Array(adultCount).fill({ type: 'adult' });
    
    // Duffel API requires dates in YYYY-MM-DD format
    const targetDate = date ? new Date(date as string) : new Date(Date.now() + 86400000); // tomorrow by default
    const formattedDate = targetDate.toISOString().split('T')[0];

    let offerRequestResponse;
    try {
      offerRequestResponse = await duffel.offerRequests.create({
        return_offers: true,
        slices: [
          {
            origin: originIata,
            destination: destinationIata,
            departure_date: formattedDate
          } as any
        ],
        passengers: passengerArray,
        cabin_class: cabin as any // Duffel expects 'first', 'business', 'premium_economy', or 'economy'
        // Unfortunately, Duffel SDK currently doesn't allow 'currency' in slices directly.
        // It relies on POS (point of sale). We'll convert it manually below if it's not INR.
      });
    } catch (err: any) {
      console.error("Duffel API Error:", err?.errors || err);
      return res.status(500).json({ message: "Error fetching flights from Duffel" });
    }

    if (!offerRequestResponse || !offerRequestResponse.data) {
      return res.status(500).json({ message: "No data received from Duffel" });
    }

    const offers = offerRequestResponse.data.offers || [];
    
    // Map Duffel offers to our frontend's expected Flight schema
    let flights = offers.map(offer => {
      const slice = offer.slices[0];
      const segment = slice.segments[0];
      
      // Calculate duration in minutes (Duffel provides duration as ISO 8601 duration string, e.g. "PT2H30M", but we can also calculate from dates)
      const depTime = new Date(segment.departing_at);
      const arrTime = new Date(segment.arriving_at);
      const durationMinutes = Math.floor((arrTime.getTime() - depTime.getTime()) / 60000);

      // Convert price string to number and handle currency
      let price = parseFloat(offer.total_amount);
      const currency = offer.total_currency;
      
      if (currency === 'GBP') price = price * 105;
      else if (currency === 'USD') price = price * 83;
      else if (currency === 'EUR') price = price * 90;
      
      price = Math.round(price);

      return {
        _id: offer.id, // Use Duffel's offer ID so we can book it later if needed
        airline: offer.owner.name,
        airlineLogo: offer.owner.logo_symbol_url || '',
        flightNumber: segment.marketing_carrier_flight_number,
        departureCity: segment.origin.city_name || segment.origin.name,
        departureAirportCode: segment.origin.iata_code,
        arrivalCity: segment.destination.city_name || segment.destination.name,
        arrivalAirportCode: segment.destination.iata_code,
        departureTime: segment.departing_at,
        arrivalTime: segment.arriving_at,
        durationMinutes: durationMinutes,
        price: price,
        stops: slice.segments.length - 1
      };
    });

    // Apply filters
    if (stops !== undefined && stops !== '') {
      flights = flights.filter(f => f.stops === Number(stops));
    }
    
    if (morningDeparture === 'true') {
      flights = flights.filter(f => {
        const hour = new Date(f.departureTime).getHours();
        return hour >= 6 && hour < 12;
      });
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
