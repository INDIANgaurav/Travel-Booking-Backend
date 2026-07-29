import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import RecentSearch from './search.model';
import Flight from '../inventory/flight.model';
import { searchFlightsNexus, checkAvailability } from '../flights/nexusdmc.service';
import jwt from 'jsonwebtoken';
import User from '../users/user.model';
import SeriesFare from '../seriesFare/seriesFare.model';
import { Request } from 'express';

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
        const leg = flightSegment.legs[0]; // First leg for departure
        const lastLeg = flightSegment.legs[flightSegment.legs.length - 1]; // Last leg for arrival
        
        const depTime = new Date(leg.departure_time);
        const arrTime = new Date(lastLeg.arrival_time);
        const durationMinutes = flightSegment.duration;

        let price = offer.total_price;
        
        // Apply markup for non-agents (e.g. 10%)
        // if (!isAgent) {
        //   price = price * 1.10;
        // }
        
        price = Math.round(price);

        return {
          _id: offer.key, // Use NexusDMC key so we can book it later
          airline: leg.airline, // Just the code for now, UI might need mapping
          airlineLogo: `https://pics.avs.io/200/200/${leg.airline}.png`,
          flightNumber: `${leg.airline}-${leg.flight_number}`,
          departureCity: leg.origin,
          departureAirportCode: leg.origin,
          arrivalCity: lastLeg.destination,
          arrivalAirportCode: lastLeg.destination,
          departureTime: leg.departure_time,
          arrivalTime: lastLeg.arrival_time,
          durationMinutes: durationMinutes,
          price: price, // Marked up price for UI
          stops: flightSegment.legs.length - 1,
          nexus_query: searchResult._data.query, // Need to save this to pass back for Check Avail / Booking
          nexus_total_price: offer.total_price, // The EXACT price Nexus expects in Book API
          seatsAvailable: offer.seats_available,
          adultPrice: offer.adult_price,
          childPrice: offer.child_price,
          infantPrice: offer.infant_price,
          checkinBaggage: offer.checkin_baggage,
          cabinBaggage: offer.cabin_baggage,
          cabinClass: offer.cabin_type,
          inputRequirements: searchResult._data.input_requirements
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

    // 3. Fetch from NexusDMC (only dates available)
    try {
      const { getAvailableDates } = require('../flights/nexusdmc.service');
      const nexusDatesResult = await getAvailableDates(originIata, destinationIata);
      
      console.log('Nexus Dates Result:', JSON.stringify(nexusDatesResult, null, 2));

      if (nexusDatesResult && nexusDatesResult.success && nexusDatesResult._data && nexusDatesResult._data.sector) {
        const dateList = nexusDatesResult._data.sector.date || [];
        dateList.forEach((dateStr: string) => {
          if (!pricesMap[dateStr]) {
            pricesMap[dateStr] = -1; // -1 indicates available but price unknown
          }
        });
      }
    } catch (nexusErr) {
      console.error("Error fetching nexus dates for calendar:", nexusErr);
    }

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

// @desc    Get all available flight cities
// @route   GET /api/searches/cities
// @access  Public
export const getFlightCities = async (req: Request, res: Response) => {
  try {
    // This is ONLY a lookup dictionary for resolving IATA codes to readable names.
    // It does NOT decide which cities to show — only DB + API data decides that.
    const IATA_LOOKUP: Record<string, { name: string; airport: string; country: string }> = {
      'DEL': { name: 'New Delhi', airport: 'Indira Gandhi International Airport', country: 'India' },
      'BOM': { name: 'Mumbai', airport: 'Chhatrapati Shivaji International Airport', country: 'India' },
      'NMI': { name: 'Navi Mumbai', airport: 'Navi Mumbai International Airport', country: 'India' },
      'BLR': { name: 'Bengaluru', airport: 'Kempegowda International Airport', country: 'India' },
      'GOI': { name: 'Goa', airport: 'Dabolim Airport', country: 'India' },
      'GOX': { name: 'Goa (Mopa)', airport: 'Manohar International Airport', country: 'India' },
      'CCU': { name: 'Kolkata', airport: 'Netaji Subhash Chandra Bose Airport', country: 'India' },
      'HYD': { name: 'Hyderabad', airport: 'Rajiv Gandhi International Airport', country: 'India' },
      'MAA': { name: 'Chennai', airport: 'Chennai International Airport', country: 'India' },
      'AMD': { name: 'Ahmedabad', airport: 'Sardar Vallabhbhai Patel International Airport', country: 'India' },
      'PNQ': { name: 'Pune', airport: 'Pune International Airport', country: 'India' },
      'JAI': { name: 'Jaipur', airport: 'Jaipur International Airport', country: 'India' },
      'LKO': { name: 'Lucknow', airport: 'Chaudhary Charan Singh International Airport', country: 'India' },
      'COK': { name: 'Kochi', airport: 'Cochin International Airport', country: 'India' },
      'TRV': { name: 'Thiruvananthapuram', airport: 'Trivandrum International Airport', country: 'India' },
      'CCJ': { name: 'Kozhikode', airport: 'Calicut International Airport', country: 'India' },
      'IXB': { name: 'Bagdogra', airport: 'Bagdogra Airport', country: 'India' },
      'GAU': { name: 'Guwahati', airport: 'Lokpriya Gopinath Bordoloi International Airport', country: 'India' },
      'SXR': { name: 'Srinagar', airport: 'Sheikh ul-Alam International Airport', country: 'India' },
      'IXC': { name: 'Chandigarh', airport: 'Shaheed Bhagat Singh International Airport', country: 'India' },
      'PAT': { name: 'Patna', airport: 'Jay Prakash Narayan International Airport', country: 'India' },
      'VNS': { name: 'Varanasi', airport: 'Lal Bahadur Shastri International Airport', country: 'India' },
      'NAG': { name: 'Nagpur', airport: 'Dr. Babasaheb Ambedkar International Airport', country: 'India' },
      'BBI': { name: 'Bhubaneswar', airport: 'Biju Patnaik International Airport', country: 'India' },
      'ATQ': { name: 'Amritsar', airport: 'Sri Guru Ram Dass Jee International Airport', country: 'India' },
      'IDR': { name: 'Indore', airport: 'Devi Ahilyabai Holkar Airport', country: 'India' },
      'RPR': { name: 'Raipur', airport: 'Swami Vivekananda Airport', country: 'India' },
      'IXZ': { name: 'Port Blair', airport: 'Veer Savarkar International Airport', country: 'India' },
      'BDQ': { name: 'Vadodara', airport: 'Vadodara Airport', country: 'India' },
      'STV': { name: 'Surat', airport: 'Surat Airport', country: 'India' },
      'BHO': { name: 'Bhopal', airport: 'Raja Bhoj Airport', country: 'India' },
      'DXB': { name: 'Dubai', airport: 'Dubai International Airport', country: 'UAE' },
      'SHJ': { name: 'Sharjah', airport: 'Sharjah International Airport', country: 'UAE' },
      'AUH': { name: 'Abu Dhabi', airport: 'Abu Dhabi International Airport', country: 'UAE' },
      'BKK': { name: 'Bangkok', airport: 'Suvarnabhumi Airport', country: 'Thailand' },
      'DMK': { name: 'Bangkok (Don Mueang)', airport: 'Don Mueang International Airport', country: 'Thailand' },
      'LHR': { name: 'London', airport: 'Heathrow Airport', country: 'UK' },
      'SYD': { name: 'Sydney', airport: 'Kingsford Smith Airport', country: 'Australia' },
      'BNE': { name: 'Brisbane', airport: 'Brisbane Airport', country: 'Australia' },
      'MEL': { name: 'Melbourne', airport: 'Melbourne Airport', country: 'Australia' },
      'AKL': { name: 'Auckland', airport: 'Auckland Airport', country: 'New Zealand' },
      'DPS': { name: 'Bali', airport: 'Ngurah Rai International Airport', country: 'Indonesia' },
      'SIN': { name: 'Singapore', airport: 'Changi Airport', country: 'Singapore' },
      'KUL': { name: 'Kuala Lumpur', airport: 'Kuala Lumpur International Airport', country: 'Malaysia' },
      'HKG': { name: 'Hong Kong', airport: 'Hong Kong International Airport', country: 'Hong Kong' },
      'JFK': { name: 'New York', airport: 'John F. Kennedy International Airport', country: 'USA' },
      'YYZ': { name: 'Toronto', airport: 'Toronto Pearson International Airport', country: 'Canada' },
      'CDG': { name: 'Paris', airport: 'Charles de Gaulle Airport', country: 'France' },
      'FRA': { name: 'Frankfurt', airport: 'Frankfurt Airport', country: 'Germany' },
      'ICN': { name: 'Seoul', airport: 'Incheon International Airport', country: 'South Korea' },
      'NRT': { name: 'Tokyo', airport: 'Narita International Airport', country: 'Japan' },
      'CMB': { name: 'Colombo', airport: 'Bandaranaike International Airport', country: 'Sri Lanka' },
      'DAC': { name: 'Dhaka', airport: 'Hazrat Shahjalal International Airport', country: 'Bangladesh' },
      'KTM': { name: 'Kathmandu', airport: 'Tribhuvan International Airport', country: 'Nepal' },
      'MLE': { name: 'Male', airport: 'Velana International Airport', country: 'Maldives' },
      'DOH': { name: 'Doha', airport: 'Hamad International Airport', country: 'Qatar' },
      'BAH': { name: 'Bahrain', airport: 'Bahrain International Airport', country: 'Bahrain' },
      'MCT': { name: 'Muscat', airport: 'Muscat International Airport', country: 'Oman' },
      'JED': { name: 'Jeddah', airport: 'King Abdulaziz International Airport', country: 'Saudi Arabia' },
      'RUH': { name: 'Riyadh', airport: 'King Khalid International Airport', country: 'Saudi Arabia' },
    };

    // Step 1: Collect ONLY codes that actually have flights (from DB + API)
    const availableCodes = new Set<string>();

    // From Flights DB collection
    const flightDep = await Flight.distinct('departureAirportCode');
    const flightArr = await Flight.distinct('arrivalAirportCode');
    (flightDep as string[]).forEach(c => { if (c) availableCodes.add(c.toUpperCase()); });
    (flightArr as string[]).forEach(c => { if (c) availableCodes.add(c.toUpperCase()); });

    // From SeriesFare DB collection
    const sfOrigins = await SeriesFare.distinct('origin');
    const sfDestinations = await SeriesFare.distinct('destination');
    (sfOrigins as string[]).forEach(c => { if (c) availableCodes.add(c.toUpperCase()); });
    (sfDestinations as string[]).forEach(c => { if (c) availableCodes.add(c.toUpperCase()); });

    // From Nexus DMC API sectors
    try {
      const { getAvailableSectors } = require('../flights/nexusdmc.service');
      const sectorsResult = await getAvailableSectors();
      if (sectorsResult?.success && sectorsResult?._data?.sectors) {
        for (const sector of sectorsResult._data.sectors) {
          if (sector.origin) availableCodes.add(sector.origin.toUpperCase());
          if (sector.destination) availableCodes.add(sector.destination.toUpperCase());
        }
      }
    } catch (nexusErr) {
      // Nexus API might be down, continue with DB results
    }

    // Step 2: Build the final list using ONLY available codes, resolving names from lookup
    const cities = Array.from(availableCodes).map(code => {
      const info = IATA_LOOKUP[code];
      return {
        code,
        name: info?.name || code,
        airport: info?.airport || `${code} Airport`,
        country: info?.country || 'Unknown'
      };
    });

    // Sort: known cities first (with proper names), then unknown codes
    cities.sort((a, b) => {
      const aKnown = IATA_LOOKUP[a.code] ? 0 : 1;
      const bKnown = IATA_LOOKUP[b.code] ? 0 : 1;
      if (aKnown !== bKnown) return aKnown - bKnown;
      return a.name.localeCompare(b.name);
    });

    res.json(cities);
  } catch (error: any) {
    console.error('Error fetching flight cities:', error);
    res.status(500).json({ message: 'Failed to fetch flight cities' });
  }
};

