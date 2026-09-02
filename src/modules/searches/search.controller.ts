import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import RecentSearch from './search.model';
import Flight from '../inventory/flight.model';
import { searchFlightsNexus, checkAvailability } from '../flights/nexusdmc.service';
import jwt from 'jsonwebtoken';
import { searchFlights as searchFlightsGapi } from '../flights/gapi.service';
import User from '../users/user.model';
import SeriesFare from '../seriesFare/seriesFare.model';
import Supplier from '../supplier/supplier.model';
import { Request } from 'express';

// @desc    Get recent searches for user
// @route   GET /api/searches/recent
// @access  Private
export const getRecentSearches = async (req: AuthRequest, res: Response) => {
  try {
    const searches = await RecentSearch.find({ user: req.user._id }).lean()
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
  const city = cityName.trim();
  
  // If it's already a 3 letter code, just return it
  if (city.length === 3) return city.toUpperCase();
  
  // Try to extract from format like "New York (JFK)"
  const match = city.match(/\(([A-Z]{3})\)/i);
  if (match) return match[1].toUpperCase();

  const cityLower = city.toLowerCase();
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
  return map[cityLower] || city.toUpperCase().substring(0, 3);
};

export const getFlightsData = async (queryParams: any, isAgent: boolean = false, agentId: any = null) => {
    const { from, to, date, adults, children, infants, cabinClass, returnDate, tripType, stops, morningDeparture, passengers } = queryParams;
    const originIata = getIataCode(from as string);
    const destinationIata = getIataCode(to as string);
    
    const adultCount = Number(adults) || Number(passengers) || 1;
    const childCount = Number(children) || 0;
    const infantCount = Number(infants) || 0;

    let targetDate = date ? new Date(date as string) : new Date(Date.now() + 86400000);
    if (isNaN(targetDate.getTime())) {
      targetDate = new Date(Date.now() + 86400000); // fallback to tomorrow if date is invalid
    }
    const formattedDate = targetDate.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD

    const segment = `${originIata}-${destinationIata}-${formattedDate}`;
    const pax = `${adultCount}-${childCount}-${infantCount}`;

    let nexusSupplier: any = null;
    let agentMarkupData: any = null;
    try {
      nexusSupplier = await Supplier.findOne({ name: 'Nexus DMC' }).lean();
      
      // Fetch agent's active flight markup if logged in
      if (isAgent && agentId) {
        const Markup = require('../agents/markup.model').Markup;
        agentMarkupData = await Markup.findOne({ 
          agentId, 
          product: 'flights',
          status: 'ACTIVE' 
        });
      }
    } catch (err) {
      console.error("Error fetching supplier or markup data", err);
    }
    
    let gapiSupplier: any = null;
    try {
      gapiSupplier = await Supplier.findOne({ name: 'GAPI INFOTECH' }).lean();
    } catch(e) {}

    let cugMappings: any[] = [];
    if (isAgent && agentId) {
      try {
        const CugMapping = require('../supplier/cugMapping.model').default;
        cugMappings = await CugMapping.find({ agent: agentId, isActive: true }).lean();
      } catch (e) {
        console.error("Error fetching CUG Mappings", e);
      }
    }

    const todayDate = new Date();
    todayDate.setUTCHours(0,0,0,0);
    const flightDate = new Date(targetDate);
    flightDate.setUTCHours(0,0,0,0);
    const daysAhead = Math.max(0, Math.floor((flightDate.getTime() - todayDate.getTime()) / 86400000));

    const isFlightAllowedByCUG = (supplierObj: any, airlineCode: string) => {
      if (!supplierObj) return true;
      const supplierId = supplierObj._id;
      const supplierCugEnabled = supplierObj.cugEnabled;

      const mapping = cugMappings.find((m: any) => m.supplier.toString() === supplierId.toString());

      if (supplierCugEnabled && !mapping) return false;

      if (mapping) {
        if (mapping.limitDay !== undefined && mapping.limitDay !== null && daysAhead > mapping.limitDay) {
          return false;
        }
        if (mapping.restrictAirline) {
          const blockedAirlines = mapping.restrictAirline.split(',').map((s: string) => s.trim().toUpperCase()).filter((s: string) => s);
          if (blockedAirlines.includes(airlineCode.toUpperCase())) {
            return false;
          }
        }
      }

      return true;
    };

    // Helper to calculate agent markup
    const applyAgentMarkup = (basePrice: number) => {
      let markupAmount = 0;
      if (agentMarkupData) {
        if (agentMarkupData.type === 'fixed') {
          markupAmount = agentMarkupData.value;
        } else if (agentMarkupData.type === 'percentage') {
          markupAmount = (basePrice * agentMarkupData.value) / 100;
        }
        
        // Enforce min/max if present
        if (agentMarkupData.min && markupAmount < agentMarkupData.min) markupAmount = agentMarkupData.min;
        if (agentMarkupData.max && markupAmount > agentMarkupData.max) markupAmount = agentMarkupData.max;
      }
      return Math.round(markupAmount * (adultCount + childCount));
    };

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

        let basePrice = offer.total_price;
        
        // Calculate Commission
        let finalCommission = 0;
        if (nexusSupplier && nexusSupplier.commission) {
          const percComm = (basePrice * nexusSupplier.commission.percentage) / 100;
          finalCommission = Math.max(percComm, nexusSupplier.commission.fixedAmount);
        }
        
        const price = Math.round(basePrice + finalCommission);

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
          adultPrice: offer.adult_price + (finalCommission / (adultCount + childCount + infantCount)), // Distributed roughly
          childPrice: offer.child_price + (finalCommission / (adultCount + childCount + infantCount)),
          infantPrice: offer.infant_price,
          checkinBaggage: offer.checkin_baggage,
          cabinBaggage: offer.cabin_baggage,
          cabinClass: offer.cabin_type,
          inputRequirements: searchResult._data.input_requirements,
          supplierId: nexusSupplier?._id, // Attach supplierId for pre-booking validation
          agentCommission: finalCommission,
          agentMarkup: 0
        };
      });

      // Filter Nexus flights based on CUG mappings for everyone (B2C and B2B)
      flights = flights.filter(f => isFlightAllowedByCUG(nexusSupplier, f.airline));
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

      const seriesFares = await SeriesFare.find(sfFilter).lean();
      // Fetch all active suppliers to match by name (supplierId in SF stores User._id, not Supplier._id)
      const allSuppliers = await Supplier.find({ isActive: true }).lean();
      
      let sfMapped = seriesFares.map((sf: any) => {
        const dateStr = sf.travelDate ? sf.travelDate.toISOString().split('T')[0] : '2026-08-22';
        const depTime = `${dateStr}T${sf.departureTime}:00`;
        const arrTime = `${dateStr}T${sf.arrivalTime}:00`;
        
        let depDateObj = new Date(depTime);
        let arrDateObj = new Date(arrTime);
        if (arrDateObj < depDateObj) {
          arrDateObj.setDate(arrDateObj.getDate() + 1); // Arrival is next day
        }
        const durationMinutes = Math.round((arrDateObj.getTime() - depDateObj.getTime()) / 60000);

        const basePrice = Math.round((sf.adtFare * adultCount) + (sf.chdFare * childCount) + (sf.infFare * infantCount));
        
        let uploaderCommission = (sf.agentCommission || 0) * (adultCount + childCount);
        let adminCommission = 0;
        // Match supplier by name (case-insensitive) since supplierId field stores User._id not Supplier._id
        const supplier = allSuppliers.find((s: any) => 
          s.name && sf.supplierName && s.name.toLowerCase() === sf.supplierName.toLowerCase()
        );
        if (supplier && supplier.commission) {
          const percComm = (basePrice * supplier.commission.percentage) / 100;
          adminCommission = Math.max(percComm, supplier.commission.fixedAmount);
        }

        const agentMarkupAmount = applyAgentMarkup(basePrice);
        // Base Price + Uploader Profit (if any) + Admin Commission + Searching Agent's markup
        const price = basePrice + uploaderCommission + adminCommission + agentMarkupAmount; 
        
        // Final agentCommission to pass to booking is what Admin & Uploader earn from this sale
        const finalCommission = uploaderCommission + adminCommission;

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
          arrivalTime: arrDateObj.toISOString().slice(0, 19), // Save the calculated exact time
          durationMinutes: durationMinutes > 0 ? durationMinutes : 135, // Fallback if negative
          price: price, // Show exact base + commission without additional markup
          adultPrice: sf.adtFare + (finalCommission / (adultCount + childCount + infantCount)),
          childPrice: sf.chdFare + (finalCommission / (adultCount + childCount + infantCount)),
          infantPrice: sf.infFare,
          stops: 0,
          isSeriesFare: true,
          seriesFareId: sf.sfId,
          airlinePnr: sf.airlinePnr,
          availableSeats: sf.availableSeats,
          baseFare: basePrice,
          agentCommission: finalCommission,
          agentMarkup: agentMarkupAmount,
          commissionPerPassenger: finalCommission / (adultCount + childCount + infantCount),
          supplierId: supplier ? supplier._id : null,
          supplierObj: supplier // keep temporary object for CUG check
        };
      });

      // Filter Series Fares based on CUG mappings for everyone
      sfMapped = sfMapped.filter((f: any) => isFlightAllowedByCUG(f.supplierObj, f.airline));

      // Cleanup temporary object
      sfMapped = sfMapped.map((f: any) => {
        delete f.supplierObj;
        return f;
      });

      flights = [...sfMapped, ...flights];
    } catch (sfErr) {
      console.error("Error fetching series fares:", sfErr);
    }

    // Merge active GAPI Fares matching route
    let gapiSearchResult: any[] = [];
    try {
      if (gapiSupplier && gapiSupplier.isActive) {
        gapiSearchResult = await searchFlightsGapi({ query: queryParams });
      }
    } catch (err: any) {
      console.error("GAPI API Error:", err);
    }
    
    if (gapiSearchResult && gapiSearchResult.length > 0) {
      // Map GAPI 2D array response to flights
      gapiSearchResult.forEach((flightGroup: any[]) => {
        // flightGroup is an array representing [Onward, Return]
        const onward = flightGroup[0];
        if (onward) {
            const leg = onward.segments[0][0]; // First segment leg
            const lastLeg = onward.segments[0][onward.segments[0].length - 1];
            
            const depTime = leg.origin.depTime;
            const arrTime = lastLeg.destination.arrTime;
            const durationMinutes = leg.duration || 120; // fallback if missing
            
            let basePrice = onward.fare.publishedFare;
            
            let finalCommission = 0;
            if (gapiSupplier && gapiSupplier.commission) {
              const percComm = (basePrice * gapiSupplier.commission.percentage) / 100;
              finalCommission = Math.max(percComm, gapiSupplier.commission.fixedAmount);
            }
            const agentMarkupAmount = applyAgentMarkup(basePrice);
            
            const price = Math.round(basePrice + finalCommission + agentMarkupAmount);
            
            flights.push({
              _id: `GAPI_${onward.resultSessionId}`, // Save sessionId for fareQuote
              airline: leg.airline.airlineCode,
              airlineLogo: `https://pics.avs.io/200/200/${leg.airline.airlineCode}.png`,
              flightNumber: `${leg.airline.airlineCode}-${leg.airline.flightNumber}`,
              departureCity: leg.origin.airport.cityCode,
              departureAirportCode: leg.origin.airport.airportCode,
              arrivalCity: lastLeg.destination.airport.cityCode,
              arrivalAirportCode: lastLeg.destination.airport.airportCode,
              departureTime: depTime,
              arrivalTime: arrTime,
              durationMinutes: durationMinutes,
              price: price,
              adultPrice: (onward.fare.publishedFare / adultCount) + (finalCommission / (adultCount + childCount + infantCount)),
              childPrice: (onward.fare.publishedFare / adultCount) + (finalCommission / (adultCount + childCount + infantCount)),
              infantPrice: 0,
              stops: onward.segments[0].length - 1,
              isGapiFare: true,
              resultSessionId: onward.resultSessionId,
              fareIdentifire: onward.fare.fareIdentifire,
              availableSeats: leg.noOfSeatAvailable || 9,
              baseFare: basePrice,
              agentCommission: finalCommission,
              agentMarkup: agentMarkupAmount,
              supplierId: gapiSupplier?._id,
              supplierObj: gapiSupplier
            });
        }
      });
      // Filter GAPI flights based on CUG mappings
      flights = flights.filter(f => !f.isGapiFare || isFlightAllowedByCUG(f.supplierObj, f.airline));
      
      // Cleanup temporary object
      flights = flights.map((f: any) => {
        if (f.supplierObj) delete f.supplierObj;
        return f;
      });
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

    return flights;
};

export const getNearestFlightsData = async (from: string, to: string, targetDate?: string) => {
    const originIata = getIataCode(from);
    const destinationIata = getIataCode(to);
    
    const startOfDay = targetDate ? new Date(targetDate) : new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const SeriesFare = require('../seriesFare/seriesFare.model').default;
    const sfFilter: any = {
      origin: { $regex: new RegExp(`^${originIata}$`, 'i') },
      destination: { $regex: new RegExp(`^${destinationIata}$`, 'i') },
      status: { $regex: new RegExp('^Active$', 'i') },
      travelDate: { $gte: startOfDay }
    };

    const seriesFares = await SeriesFare.find(sfFilter).sort({ travelDate: 1 }).limit(5).lean();
    // Fetch all active suppliers to match by name for commission calculation
    const allSuppliers = await Supplier.find({ isActive: true }).lean();
    
    const sfMapped = seriesFares.map((sf: any) => {
      const dateStr = sf.travelDate ? sf.travelDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      const depTime = `${dateStr}T${sf.departureTime}:00`;
      
      // Calculate commission from supplier (compare percentage vs fixedAmount, use whichever is higher)
      let commission = sf.agentCommission || 0;
      const supplier = allSuppliers.find((s: any) => 
        s.name && sf.supplierName && s.name.toLowerCase() === sf.supplierName.toLowerCase()
      );

      if (supplier && supplier.commission) {
        const percComm = (sf.adtFare * supplier.commission.percentage) / 100;
        commission = Math.max(percComm, supplier.commission.fixedAmount);
      }

      
      return {
        airline: sf.airline,
        flightNumber: sf.flightNo || 'SF-1107',
        departureCity: sf.origin,
        arrivalCity: sf.destination,
        departureTime: depTime,
        price: sf.adtFare + commission,
        isSeriesFare: true,
        availableSeats: sf.availableSeats
      };
    });

    const dbFilter: any = {
      departureAirportCode: { $regex: new RegExp(`^${originIata}$`, 'i') },
      arrivalAirportCode: { $regex: new RegExp(`^${destinationIata}$`, 'i') },
      departureTime: { $gte: startOfDay }
    };

    const dbFlights = await Flight.find(dbFilter).sort({ departureTime: 1 }).limit(5).lean();

    const dbMapped = dbFlights.map((f: any) => ({
        airline: f.airline,
        flightNumber: f.flightNumber,
        departureCity: f.departureCity,
        arrivalCity: f.arrivalCity,
        departureTime: f.departureTime,
        price: f.price,
        isInventoryFare: true,
        availableSeats: f.availableSeats || 50
    }));

    let nexusMapped: any[] = [];
    try {
      const { getAvailableDates, searchFlightsNexus } = require('../flights/nexusdmc.service');
      const nexusDatesResult = await getAvailableDates(originIata, destinationIata);
      
      if (nexusDatesResult?.success && nexusDatesResult?._data?.sector?.date) {
        const dateList: string[] = nexusDatesResult._data.sector.date;
        const todayStr = startOfDay.toISOString().split('T')[0];
        
        const upcomingNexusDates = dateList
          .filter(d => d >= todayStr)
          .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
          .slice(0, 2);

        for (const dateStr of upcomingNexusDates) {
           const formattedDate = dateStr.replace(/-/g, ''); // YYYYMMDD
           const segment = `${originIata}-${destinationIata}-${formattedDate}`;
           const pax = `1-0-0`;
           try {
              const searchResult = await searchFlightsNexus(segment, pax);
              if (searchResult?.success && searchResult?._data?.flights?.length > 0) {
                 const offer = searchResult._data.flights[0];
                 const flightSegment = offer.segments[0];
                 const leg = flightSegment.legs[0];
                 const lastLeg = flightSegment.legs[flightSegment.legs.length - 1];
                 
                 nexusMapped.push({
                    airline: leg.airline,
                    flightNumber: `${leg.airline}-${leg.flight_number}`,
                    departureCity: leg.origin,
                    arrivalCity: lastLeg.destination,
                    departureTime: leg.departure_time,
                    price: Math.round(offer.total_price),
                    isSeriesFare: true,
                    availableSeats: offer.seats_available
                 });
              }
           } catch (e) {
              console.error(`Nexus search failed for nearest fallback ${segment}`);
           }
        }
      }
    } catch (err) {
      console.error("Nexus available dates error in nearest fallback");
    }

    let allFlights = [...sfMapped, ...dbMapped, ...nexusMapped];
    
    // Sort all flights chronologically by departure date
    allFlights.sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime());
    
    return allFlights.slice(0, 3);
};

export const searchFlights = async (req: AuthRequest, res: Response) => {
  try {
    let isAgent = false;
    let agentId = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET || '');
        const user = await User.findById(decoded.id).select('roles agentStatus _id');
        if (user && (user.roles.includes('SUPER_ADMIN') || user.roles.includes('SUB_ADMIN') || (user.roles.includes('B2B_AGENT') && user.agentStatus === 'APPROVED'))) {
          isAgent = true;
          agentId = user._id;
        }
      } catch (e) {
        // Ignore token errors for public search
      }
    }
    console.log("✈️ Flight Search Request Received:", req.query);

    const flights = await getFlightsData(req.query, isAgent, agentId);
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
    let isAgent = false;
    let agentId = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET || '');
        const user = await User.findById(decoded.id).select('roles agentStatus _id');
        if (user && (user.roles.includes('SUPER_ADMIN') || user.roles.includes('SUB_ADMIN') || (user.roles.includes('B2B_AGENT') && user.agentStatus === 'APPROVED'))) {
          isAgent = true;
          agentId = user._id;
        }
      } catch (e) {
        // Ignore token errors
      }
    }

    const { origin, destination } = req.query;
    if (!origin || !destination) {
      return res.status(400).json({ message: "Origin and Destination are required" });
    }

    let cugMappings: any[] = [];
    if (isAgent && agentId) {
      try {
        const CugMapping = require('../supplier/cugMapping.model').default;
        cugMappings = await CugMapping.find({ agent: agentId, isActive: true }).lean();
      } catch (e) {
        console.error("Error fetching CUG Mappings for calendar", e);
      }
    }

    const todayDate = new Date();
    todayDate.setUTCHours(0,0,0,0);

    const isDateAllowedByCUG = (supplierObj: any, flightDateStr: string, airlineCode?: string) => {
      if (!supplierObj) return true;
      const supplierId = supplierObj._id;
      const supplierCugEnabled = supplierObj.cugEnabled;

      const mapping = cugMappings.find((m: any) => m.supplier.toString() === supplierId.toString());
      if (supplierCugEnabled && !mapping) return false;

      if (mapping) {
        if (mapping.limitDay !== undefined && mapping.limitDay !== null) {
          const fDate = new Date(flightDateStr);
          fDate.setUTCHours(0,0,0,0);
          const daysAhead = Math.max(0, Math.floor((fDate.getTime() - todayDate.getTime()) / 86400000));
          if (daysAhead > mapping.limitDay) return false;
        }
        if (mapping.restrictAirline && airlineCode) {
          const blockedAirlines = mapping.restrictAirline.split(',').map((s: string) => s.trim().toUpperCase()).filter((s: string) => s);
          if (blockedAirlines.includes(airlineCode.toUpperCase())) {
            return false;
          }
        }
      }
      return true;
    };

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

    // Fetch all active suppliers for commission calculation
    const calSuppliers = await Supplier.find({ isActive: true }).lean();

    // Group Series Fares (with supplier commission: compare percentage vs fixedAmount, use higher)
    sfFlights.forEach((sf: any) => {
      if (!sf.travelDate) return;
      const dateStr = formatDateStr(sf.travelDate);
      
      let commission = sf.agentCommission || 0;
      const supplier = calSuppliers.find((s: any) => 
        s.name && sf.supplierName && s.name.toLowerCase() === sf.supplierName.toLowerCase()
      );

      // CUG Check
      if (!isDateAllowedByCUG(supplier, dateStr, sf.airline)) {
        return; // Skip this series fare date
      }

      if (supplier && supplier.commission) {
        const percComm = (sf.adtFare * supplier.commission.percentage) / 100;
        commission = Math.max(percComm, supplier.commission.fixedAmount);
      }
      
      const price = Math.round(sf.adtFare + commission);
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
      const nexusSupplier = await Supplier.findOne({ name: 'Nexus DMC' }).lean();
      const { getAvailableDates } = require('../flights/nexusdmc.service');
      const nexusDatesResult = await getAvailableDates(originIata, destinationIata);
      
      console.log('Nexus Dates Result:', JSON.stringify(nexusDatesResult, null, 2));

      if (nexusDatesResult && nexusDatesResult.success && nexusDatesResult._data && nexusDatesResult._data.sector) {
        const dateList = nexusDatesResult._data.sector.date || [];
        dateList.forEach((dateStr: string) => {
          // dateStr from Nexus is usually YYYY-MM-DD
          if (!isDateAllowedByCUG(nexusSupplier, dateStr)) {
            return; // Skip this date
          }
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
    const hotels = await Hotel.find(query).lean();
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
    const buses = await Bus.find(query).lean();
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

