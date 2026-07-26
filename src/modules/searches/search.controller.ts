import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import RecentSearch from './search.model';
import Flight from '../inventory/flight.model';
import { searchFlightsNexus, checkAvailability } from '../flights/nexusdmc.service';
import jwt from 'jsonwebtoken';
import User from '../users/user.model';

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
    const { from, to, date, adults, children, infants, cabinClass, returnDate, tripType, stops, morningDeparture, passengers } = req.query;

    let isAgent = false;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET || '');
        const user = await User.findById(decoded.id).select('role agentStatus');
        if (user && (user.role === 'SUPER_ADMIN' || user.role === 'SUB_ADMIN' || (user.role === 'TRAVEL_AGENT' && user.agentStatus === 'APPROVED'))) {
          isAgent = true;
        }
      } catch (e) {
        // Ignore token errors for public search
      }
    }
    console.log("✈️ Flight Search Request Received:", req.query);
    
    const originIata = getIataCode(from as string);
    const destinationIata = getIataCode(to as string);
    
    const adultCount = Number(adults) || Number(passengers) || 1;
    const childCount = Number(children) || 0;
    const infantCount = Number(infants) || 0;

    const targetDate = date ? new Date(date as string) : new Date(Date.now() + 86400000); // tomorrow by default
    const formattedDate = targetDate.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD

    const segment = `${originIata}-${destinationIata}-${formattedDate}`;
    const pax = `${adultCount}-${childCount}-${infantCount}`;

    let searchResult;
    try {
      searchResult = await searchFlightsNexus(segment, pax);
    } catch (err: any) {
      console.error("NexusDMC API Error:", err);
      // Don't return 500 here! Let it continue to fetch Series Fares.
      searchResult = null;
    }

    let flights: any[] = [];
    
    if (!searchResult || !searchResult.success || !searchResult._data || !searchResult._data.flights || searchResult._data.flights.length === 0) {
      console.log('NexusDMC Empty/Failed Response for', segment, 'Pax:', pax);
      // Don't return early, we might still have Series Fares!
    } else {
      const nexusFlights = searchResult._data.flights;
      
      // Map NexusDMC offers to our frontend's expected Flight schema
      flights = nexusFlights.map((offer: any) => {
        const flightSegment = offer.segments[0];
        const leg = flightSegment.legs[0]; // For simplicity, take the first leg
        
        const depTime = new Date(leg.departure_time);
        const arrTime = new Date(leg.arrival_time);
        const durationMinutes = flightSegment.duration;

        let price = offer.total_price;
        
        // Apply markup for non-agents (e.g. 10%)
        if (!isAgent) {
          price = price * 1.10;
        }
        
        price = Math.round(price);

        return {
          _id: offer.key, // Use NexusDMC key so we can book it later
          airline: leg.airline, // Just the code for now, UI might need mapping
          airlineLogo: `https://pics.avs.io/200/200/${leg.airline}.png`,
          flightNumber: `${leg.airline}-${leg.flight_number}`,
          departureCity: leg.origin,
          departureAirportCode: leg.origin,
          arrivalCity: leg.destination,
          arrivalAirportCode: leg.destination,
          departureTime: leg.departure_time,
          arrivalTime: leg.arrival_time,
          durationMinutes: durationMinutes,
          price: price,
          stops: flightSegment.legs.length - 1,
          nexus_query: searchResult._data.query // Need to save this to pass back for Check Avail / Booking
        };
      });
    }

    // Merge active Series Fares matching route
    try {
      const SeriesFare = require('../seriesFare/seriesFare.model').default;
      const startOfDay = new Date(targetDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setUTCHours(23, 59, 59, 999);

      const sfFilter: any = {
        origin: { $regex: new RegExp(`^${originIata}$`, 'i') },
        destination: { $regex: new RegExp(`^${destinationIata}$`, 'i') },
        status: { $regex: new RegExp('^Active$', 'i') },
        travelDate: { $gte: startOfDay, $lte: endOfDay }
      };

      const seriesFares = await SeriesFare.find(sfFilter);
      const sfMapped = seriesFares.map((sf: any) => {
        const dateStr = sf.travelDate ? sf.travelDate.toISOString().split('T')[0] : '2026-08-22';
        const depTime = `${dateStr}T${sf.departureTime}:00`;
        const arrTime = `${dateStr}T${sf.arrivalTime}:00`;
        const basePrice = Math.round((sf.adtFare * adultCount) + (sf.chdFare * childCount) + (sf.infFare * infantCount));
        const commissionTotal = (sf.agentCommission || 0) * (adultCount + childCount); // Assuming commission applies to adults and children
        const price = basePrice + commissionTotal; // Show total (Base + Commission) on search results page

        return {
          _id: `SF_${sf._id}`,
          airline: sf.airline,
          airlineLogo: sf.airline.toLowerCase().includes('akasa')
            ? 'https://pics.avs.io/200/200/QP.png'
            : sf.airline.toLowerCase().includes('indigo')
            ? 'https://pics.avs.io/200/200/6E.png'
            : `https://pics.avs.io/200/200/AI.png`,
          flightNumber: sf.flightNo || 'SF-1107',
          departureCity: sf.origin,
          departureAirportCode: sf.origin,
          arrivalCity: sf.destination,
          arrivalAirportCode: sf.destination,
          departureTime: depTime,
          arrivalTime: arrTime,
          durationMinutes: 135,
          price: price, // Show exact base + commission without additional markup
          stops: 0,
          isSeriesFare: true,
          seriesFareId: sf.sfId,
          airlinePnr: sf.airlinePnr,
          availableSeats: sf.availableSeats,
          baseFare: basePrice,
          agentCommission: commissionTotal,
          commissionPerPassenger: sf.agentCommission || 0
        };
      });

      flights = [...sfMapped, ...flights];
    } catch (sfErr) {
      console.error("Error fetching series fares:", sfErr);
    }

    // Merge standard Inventory Flights matching route
    try {
      const startOfDay = new Date(targetDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setUTCHours(23, 59, 59, 999);

      const dbFilter: any = {
        departureAirportCode: { $regex: new RegExp(`^${originIata}$`, 'i') },
        arrivalAirportCode: { $regex: new RegExp(`^${destinationIata}$`, 'i') },
        departureTime: { $gte: startOfDay, $lte: endOfDay }
      };

      const dbFlights = await Flight.find(dbFilter).lean();
      
      const dbMapped = dbFlights.map((f: any) => ({
        ...f,
        price: f.price * (adultCount + childCount) + (infantCount > 0 ? (f.price * 0.2 * infantCount) : 0), // Simple pax calculation
        isInventoryFare: true
      }));

      flights = [...dbMapped, ...flights];
    } catch (dbErr) {
      console.error("Error fetching standard db flights:", dbErr);
    }

    // Apply filters
    if (stops !== undefined && stops !== '') {
      flights = flights.filter((f: any) => f.stops === Number(stops));
    }
    
    if (morningDeparture === 'true') {
      flights = flights.filter((f: any) => {
        const hour = new Date(f.departureTime).getHours();
        return hour >= 6 && hour < 12;
      });
    }

    // Sort by price by default
    flights.sort((a: any, b: any) => a.price - b.price);

    res.json(flights);
  } catch (error: any) {
    console.error("Flight Search Catch Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Check Flight Availability
// @route   POST /api/searches/flights/check
// @access  Public
export const checkFlightAvailability = async (req: AuthRequest, res: Response) => {
  try {
    const { query, flight_keys, total_price, currency } = req.body;
    const availResult = await checkAvailability(query, flight_keys, total_price, currency);
    
    if (!availResult || !availResult.success) {
      return res.status(400).json({ message: availResult?.error_msg || "Flight is no longer available" });
    }
    
    res.json(availResult._data);
  } catch (error: any) {
    console.error("Flight Check Availability Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get Dynamic Calendar Prices for flights
// @route   GET /api/searches/calendar-prices
// @access  Public
export const getCalendarPrices = async (req: AuthRequest, res: Response) => {
  try {
    const { origin, destination } = req.query;
    if (!origin || !destination) {
      return res.status(400).json({ message: "Origin and Destination are required" });
    }

    const originIata = getIataCode(origin as string);
    const destinationIata = getIataCode(destination as string);
    const today = new Date();
    today.setUTCHours(0,0,0,0);
    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + 11); // Fetch for 11 months

    // 1. Fetch from Series Fares
    const SeriesFare = require('../seriesFare/seriesFare.model').default;
    const sfFlights = await SeriesFare.find({
      origin: { $regex: new RegExp(`^${originIata}$`, 'i') },
      destination: { $regex: new RegExp(`^${destinationIata}$`, 'i') },
      status: { $regex: new RegExp('^Active$', 'i') },
      travelDate: { $gte: today, $lte: endDate }
    }).lean();

    // 2. Fetch from standard DB Flights
    const dbFlights = await Flight.find({
      departureAirportCode: { $regex: new RegExp(`^${originIata}$`, 'i') },
      arrivalAirportCode: { $regex: new RegExp(`^${destinationIata}$`, 'i') },
      departureTime: { $gte: today, $lte: endDate }
    }).lean();

    console.log(`Calendar Prices API: origin=${origin} (${originIata}), dest=${destination} (${destinationIata})`);
    console.log(`Calendar Prices API: Found ${dbFlights.length} standard flights and ${sfFlights.length} series fares`);

    const pricesMap: Record<string, number> = {};

    const formatDateStr = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Group Series Fares
    sfFlights.forEach((sf: any) => {
      if (!sf.travelDate) return;
      const dateStr = formatDateStr(sf.travelDate);
      const price = Math.round(sf.adtFare + (sf.agentCommission || 0));
      if (!pricesMap[dateStr] || price < pricesMap[dateStr]) {
        pricesMap[dateStr] = price;
      }
    });

    // Group Standard Flights
    dbFlights.forEach((f: any) => {
      if (!f.departureTime) return;
      const dateStr = formatDateStr(new Date(f.departureTime));
      const price = Math.round(f.price);
      if (!pricesMap[dateStr] || price < pricesMap[dateStr]) {
        pricesMap[dateStr] = price;
      }
    });

    res.json(pricesMap);
  } catch (error: any) {
    console.error("Calendar Prices Error:", error);
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
