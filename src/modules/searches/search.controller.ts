import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import RecentSearch from './search.model';
import Flight from '../inventory/flight.model';
import { searchFlightsNexus, checkAvailability } from '../flights/nexusdmc.service';
import { searchFlightsAirIq, getAvailableSectorsAirIq, getAvailableDatesAirIq } from '../flights/airiq.service';
import jwt from 'jsonwebtoken';
import { searchFlights as searchFlightsGapi } from '../flights/gapi.service';
import User from '../users/user.model';
import SeriesFare from '../seriesFare/seriesFare.model';
import Booking from '../bookings/booking.model';
import Supplier from '../supplier/supplier.model';
import { Request } from 'express';

// Memory-Bounded LRU Cache to strictly prevent Out-Of-Memory (OOM) heap exhaustion
interface CacheEntry<V> {
  value: V;
  sizeBytes: number;
}

class BoundedLRUCache<K, V> {
  private maxItems: number;
  private maxBytes: number;
  private currentBytes: number;
  private map: Map<K, CacheEntry<V>>;

  constructor(maxItems: number = 150, maxBytes: number = 50 * 1024 * 1024) {
    this.maxItems = maxItems;
    this.maxBytes = maxBytes; // 50MB ceiling
    this.currentBytes = 0;
    this.map = new Map<K, CacheEntry<V>>();
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (entry) {
      this.map.delete(key);
      this.map.set(key, entry);
      return entry.value;
    }
    return undefined;
  }

  set(key: K, value: V): void {
    const itemString = JSON.stringify(value);
    const sizeBytes = Buffer.byteLength(itemString, 'utf8');

    if (this.map.has(key)) {
      const existing = this.map.get(key)!;
      this.currentBytes -= existing.sizeBytes;
      this.map.delete(key);
    }

    while (
      (this.map.size >= this.maxItems || (this.currentBytes + sizeBytes > this.maxBytes)) &&
      this.map.size > 0
    ) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        const oldestEntry = this.map.get(oldestKey)!;
        this.currentBytes -= oldestEntry.sizeBytes;
        this.map.delete(oldestKey);
      }
    }

    if (sizeBytes <= this.maxBytes) {
      this.map.set(key, { value, sizeBytes });
      this.currentBytes += sizeBytes;
    }
  }

  clear(): void {
    this.map.clear();
    this.currentBytes = 0;
  }

  size(): number {
    return this.map.size;
  }

  memoryUsage(): { items: number; bytes: number; maxBytes: number } {
    return {
      items: this.map.size,
      bytes: this.currentBytes,
      maxBytes: this.maxBytes,
    };
  }
}

// In-memory cache capped at 150 search result sets and 50MB max heap memory
const flightSearchCache = new BoundedLRUCache<string, { data: any, timestamp: number }>(150, 50 * 1024 * 1024);

// Request coalescing map: deduplicates concurrent in-flight search requests for the identical route & date
const inFlightSearches = new Map<string, Promise<any>>();

/**
 * TEMPORARY TOGGLE: If AIRIQ_ONLY_MODE is true in environment,
 * block manual FD (Series Fares), Nexus DMC, GAPI, and DB Inventory flights,
 * ensuring search returns ONLY AirIQ flights.
 */
export const isAirIqOnlyMode = (): boolean => {
  return process.env.AIRIQ_ONLY_MODE === 'true';
};

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
  
  // Try to extract from format like "New York (JFK)" or "Goa (GOI)"
  const match = city.match(/\(([A-Z]{3})\)/i);
  if (match) return match[1].toUpperCase();

  const cityLower = city.toLowerCase();
  const map: Record<string, string> = {
    'goa': 'GOI',
    'dabolim': 'GOI',
    'mopa': 'GOX',
    'new delhi': 'DEL',
    'delhi': 'DEL',
    'mumbai': 'BOM',
    'bombay': 'BOM',
    'bengaluru': 'BLR',
    'bangalore': 'BLR',
    'chennai': 'MAA',
    'madras': 'MAA',
    'kolkata': 'CCU',
    'calcutta': 'CCU',
    'hyderabad': 'HYD',
    'pune': 'PNQ',
    'ahmedabad': 'AMD',
    'jaipur': 'JAI',
    'lucknow': 'LKO',
    'varanasi': 'VNS',
    'amritsar': 'ATQ',
    'chandigarh': 'IXC',
    'srinagar': 'SXR',
    'kochi': 'COK',
    'cochin': 'COK',
    'guwahati': 'GAU',
    'patna': 'PAT',
    'bhubaneswar': 'BBI',
    'bagdogra': 'IXB',
    'port blair': 'IXZ',
    'london': 'LHR',
    'new york': 'JFK',
    'dubai': 'DXB',
    'singapore': 'SIN',
    'bali': 'DPS',
    'denpasar': 'DPS',
    'bangkok': 'BKK'
  };

  if (map[cityLower]) return map[cityLower];

  // If it's already a 3 letter code, return it
  if (city.length === 3) return city.toUpperCase();

  return city.toUpperCase().substring(0, 3);
};

// Returns a regex pattern that matches the airport code including sister airports (e.g. GOI / GOX for Goa)
const getAirportCodeRegex = (code: string): string => {
  const c = (code || '').toUpperCase().trim();
  if (c === 'GOI' || c === 'GOX' || c === 'GOA') {
    return '^(GOI|GOX|GOA)$';
  }
  return `^${c}$`;
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

    // Concurrently fetch suppliers, commission plans, and active suppliers in parallel
    const [nexusSupplier, gapiSupplier, airIqSupplierDb, commissionPolicies, allSuppliers] = await Promise.all([
      Supplier.findOne({ name: 'Nexus DMC' }).lean().catch(() => null),
      Supplier.findOne({ name: 'GAPI INFOTECH' }).lean().catch(() => null),
      Supplier.findOne({ name: { $in: ['Air Iq', 'AirIQ', 'AIRIQ'] } }).lean().catch(() => null),
      (async () => {
        try {
          const CommissionPlan = require('../commissions/commission.model').CommissionPlan;
          return await CommissionPlan.find({ status: true, category: 'FLIGHT' }).sort({ priority: 1 }).lean();
        } catch (e) { return []; }
      })(),
      Supplier.find({ isActive: true }).lean().catch(() => [])
    ]);

    let airIqSupplier = airIqSupplierDb;
    if (isAirIqOnlyMode() && !airIqSupplier) {
      airIqSupplier = {
        name: 'Air Iq',
        isActive: true,
        searchEnabled: true,
        commission: { percentage: 0, fixedAmount: 0 }
      } as any;
    }

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

      const mapping = cugMappings.find((m: any) => m.supplier && m.supplier.toString() === supplierId.toString());

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

    const applyAdminRevenuePolicy = (basePrice: number, airlineCode: string) => {
      let adminMarkup = 0;
      let adminCommission = 0;
      
      if (!commissionPolicies || commissionPolicies.length === 0) return { markup: 0, commission: 0 };
      
      const policy = commissionPolicies.find((p: any) => p.airline === 'ALL' || p.airline === airlineCode);

      if (policy && policy.fees) {
        if (policy.fees.hiddenMarkup_checkbox) {
          const mode = policy.fees.hiddenMarkup_pf || '%';
          if (mode === '%') {
             const pct = parseFloat(policy.fees.hiddenMarkup_gross) || 0;
             adminMarkup += (basePrice * pct) / 100;
          } else {
             adminMarkup += parseFloat(policy.fees.hiddenMarkup_flat) || 0;
          }
        }
        
        const mgmtMode = policy.fees.managementFee_pf || '%';
        if (mgmtMode === '%') {
             const pct = parseFloat(policy.fees.managementFee_gross) || 0;
             adminMarkup += (basePrice * pct) / 100;
        } else {
             adminMarkup += parseFloat(policy.fees.managementFee_flat) || 0;
        }

        const commMode = policy.fees.commission_pf || '%';
        if (commMode === '%') {
             const pct = parseFloat(policy.fees.commission_gross) || 0;
             adminCommission = (basePrice * pct) / 100;
        } else {
             adminCommission = parseFloat(policy.fees.commission_flat) || 0;
        }
      }

      return { markup: Math.round(adminMarkup), commission: Math.round(adminCommission) };
    };

    const getAirlineCode = (name: string) => {
      const n = (name || '').toLowerCase();
      if (n.includes('akasa')) return 'QP';
      if (n.includes('indigo')) return '6E';
      if (n.includes('spicejet')) return 'SG';
      if (n.includes('air india express')) return 'IX';
      if (n.includes('air india')) return 'AI';
      if (n.includes('vistara')) return 'UK';
      if (n.includes('lufthansa')) return 'LH';
      if (n.includes('emirates')) return 'EK';
      if (n.includes('qatar')) return 'QR';
      if (n.includes('etihad')) return 'EY';
      if (n.includes('singapore')) return 'SQ';
      if (n.includes('british')) return 'BA';
      return 'AI';
    };

    const formatAirlineName = (name: string): string => {
      if (!name) return '';
      const trimmed = name.trim();
      const n = trimmed.toLowerCase();
      if (n.includes('air india express')) return 'Air India Express';
      if (n.includes('air india') || n === 'ai' || n === 'airindia') return 'Air India';
      if (n.includes('indigo') || n === '6e') return 'IndiGo';
      if (n.includes('spicejet') || n === 'sg') return 'SpiceJet';
      if (n.includes('vistara') || n === 'uk') return 'Vistara';
      if (n.includes('akasa')) return 'Akasa Air';
      if (n.includes('star air')) return 'Star Air';
      if (n.includes('emirates')) return 'Emirates';
      if (n.includes('qatar')) return 'Qatar Airways';
      if (n.includes('etihad')) return 'Etihad Airways';
      if (n.includes('singapore')) return 'Singapore Airlines';
      return trimmed.replace(/\b[a-z]/g, (char) => char.toUpperCase());
    };

    // Sub-Task 1: Nexus DMC
    const fetchNexus = async (): Promise<any[]> => {
      if (isAirIqOnlyMode() || !nexusSupplier || !nexusSupplier.isActive) return [];
      try {
        const searchResult = await searchFlightsNexus(segment, pax);
        if (!searchResult || !searchResult.success || !searchResult._data || !searchResult._data.flights || searchResult._data.flights.length === 0) {
          return [];
        }
        const nexusFlights = searchResult._data.flights;
        const mapped = nexusFlights.map((offer: any) => {
          const flightSegment = offer.segments[0];
          const leg = flightSegment.legs[0];
          const lastLeg = flightSegment.legs[flightSegment.legs.length - 1];
          const durationMinutes = flightSegment.duration;

          let basePrice = offer.total_price;
          let finalCommission = 0;
          if (nexusSupplier && nexusSupplier.commission) {
            const percComm = (basePrice * nexusSupplier.commission.percentage) / 100;
            finalCommission = Math.max(percComm, nexusSupplier.commission.fixedAmount);
          }
          const revPolicy = applyAdminRevenuePolicy(basePrice, leg.airline);
          if (revPolicy.commission > 0) finalCommission = revPolicy.commission;

          const price = Math.round(basePrice + finalCommission + revPolicy.markup);

          return {
            _id: offer.key,
            airline: leg.airline,
            airlineLogo: `https://pics.avs.io/200/200/${leg.airline}.png`,
            flightNumber: `${leg.airline}-${leg.flight_number}`,
            departureCity: leg.origin,
            departureAirportCode: leg.origin,
            arrivalCity: lastLeg.destination,
            arrivalAirportCode: lastLeg.destination,
            departureTime: leg.departure_time,
            arrivalTime: lastLeg.arrival_time,
            durationMinutes: durationMinutes,
            price: price,
            stops: flightSegment.legs.length - 1,
            nexus_query: searchResult._data.query,
            nexus_total_price: offer.total_price,
            seatsAvailable: offer.seats_available,
            adultPrice: offer.adult_price + (finalCommission / (adultCount + childCount + infantCount)),
            childPrice: offer.child_price + (finalCommission / (adultCount + childCount + infantCount)),
            infantPrice: offer.infant_price,
            checkinBaggage: offer.checkin_baggage,
            cabinBaggage: offer.cabin_baggage,
            cabinClass: offer.cabin_type,
            inputRequirements: searchResult._data.input_requirements,
            refundable: offer.refundable ? 'Refundable' : 'Non Refundable',
            fareRules: offer.cancellation_policy ? [{ fareRuleDetail: offer.cancellation_policy }] : [],
            supplierId: nexusSupplier?._id,
            agentCommission: finalCommission,
            agentMarkup: 0
          };
        });
        return mapped.filter((f: any) => isFlightAllowedByCUG(nexusSupplier, f.airline));
      } catch (err: any) {
        console.error("NexusDMC API Error:", err?.message || err);
        return [];
      }
    };

    // Sub-Task 2: Series Fares (MongoDB)
    const fetchSeriesFares = async (): Promise<any[]> => {
      if (isAirIqOnlyMode()) return [];
      try {
        const dateStr = (targetDate instanceof Date && !isNaN(targetDate.getTime()))
          ? targetDate.toISOString().split('T')[0]
          : String(targetDate || '').split('T')[0];

        const exactDayStart = new Date(`${dateStr}T00:00:00.000Z`);
        const startOfDay = new Date(exactDayStart.getTime() - (6 * 3600 * 1000));
        const endOfDay = new Date(exactDayStart.getTime() + (23 * 3600 * 1000 + 59 * 60 * 1000));
        const paxCount = adultCount + childCount;
        const isTestMode = queryParams.isTestFlight === 'true' || queryParams.sandbox === 'true' || queryParams.mode === 'TEST';

        const sfFilter: any = {
          origin: { $regex: new RegExp(getAirportCodeRegex(originIata), 'i') },
          destination: { $regex: new RegExp(getAirportCodeRegex(destinationIata), 'i') },
          status: { $regex: new RegExp('^Active$', 'i') },
          travelDate: { $gte: startOfDay, $lte: endOfDay },
          availableSeats: { $gte: paxCount },
          isTestFlight: isTestMode ? true : { $ne: true }
        };

        const SeriesFareModel = require('../seriesFare/seriesFare.model').default;
        const seriesFares = await SeriesFareModel.find(sfFilter).lean();
        const now = new Date();

        let sfMapped = seriesFares
          .filter((sf: any) => {
            if (!sf.departureTime || !sf.arrivalTime || sf.departureTime === 'undefined' || sf.arrivalTime === 'undefined') {
              return false;
            }
            const dStr = sf.travelDate ? sf.travelDate.toISOString().split('T')[0] : '';
            if (!dStr) return false;
            const depDateObj = new Date(`${dStr}T${sf.departureTime}:00`);
            if (isNaN(depDateObj.getTime())) return false;

            if (!isTestMode) {
              const cutoffHours = Number(sf.closeBeforeDepartureHours) >= 0 ? Number(sf.closeBeforeDepartureHours) : 2;
              const cutoffDays = Number(sf.closeBeforeDepartureDays) || 0;
              const totalCutoffMs = (cutoffDays * 24 + cutoffHours) * 60 * 60 * 1000;
              const closeCutoffTime = new Date(depDateObj.getTime() - totalCutoffMs);
              if (now >= closeCutoffTime || now >= depDateObj) return false;
            }
            return true;
          })
          .map((sf: any) => {
            const dStr = sf.travelDate ? sf.travelDate.toISOString().split('T')[0] : '2026-08-22';
            const depTime = `${dStr}T${sf.departureTime}:00`;
            const arrTime = `${dStr}T${sf.arrivalTime}:00`;
            let depDateObj = new Date(depTime);
            let arrDateObj = new Date(arrTime);
            let calculatedDayChange = sf.dayChange || 0;
            if (arrDateObj < depDateObj) {
              arrDateObj.setDate(arrDateObj.getDate() + 1);
              calculatedDayChange = 1;
            }
            const durationMinutes = Math.round((arrDateObj.getTime() - depDateObj.getTime()) / 60000);

            const adtFare = Number(sf.adtFare ?? sf.amount) || 0;
            const chdFare = Number(sf.chdFare) || 0;
            const infFare = Number(sf.infFare) || 0;
            const basePrice = Math.round((adtFare * adultCount) + (chdFare * childCount) + (infFare * infantCount));

            let uploaderCommission = (sf.agentCommission || 0) * (adultCount + childCount);
            let adminCommission = 0;
            let adminMarkupAmount = 0;

            const supplier = allSuppliers.find((s: any) =>
              s.name && sf.supplierName && s.name.toLowerCase() === sf.supplierName.toLowerCase()
            );

            const isSelfConsumption = isAgent && agentId && sf.supplierId && agentId.toString() === sf.supplierId.toString();
            if (isSelfConsumption) {
              uploaderCommission = 0;
              adminCommission = 0;
            } else {
              if (supplier && supplier.commission) {
                const percComm = (basePrice * supplier.commission.percentage) / 100;
                adminCommission = Math.max(percComm, supplier.commission.fixedAmount);
              }
              const revPolicy = applyAdminRevenuePolicy(basePrice, sf.airline);
              if (revPolicy.commission > 0) adminCommission = revPolicy.commission;
              adminMarkupAmount = revPolicy.markup;
            }

            const price = basePrice + uploaderCommission + adminCommission + adminMarkupAmount;
            const finalCommission = uploaderCommission + adminCommission;

            let arrivalDateStr = dStr;
            if (arrDateObj < depDateObj) {
              const nextDay = new Date(dStr);
              nextDay.setDate(nextDay.getDate() + 1);
              arrivalDateStr = nextDay.toISOString().split('T')[0];
            }
            const formattedArrivalTime = `${arrivalDateStr}T${sf.arrivalTime}:00`;

            const mappedSegments = (sf.segments && sf.segments.length > 0) ? sf.segments.map((s: any) => {
              const sDepTime = s.departureTime && !s.departureTime.includes('T') ? `${dStr}T${s.departureTime}:00` : (s.departureTime || depTime);
              let sArrDateStr = dStr;
              if (s.departureTime && s.arrivalTime && s.arrivalTime < s.departureTime) {
                const nextD = new Date(dStr);
                nextD.setDate(nextD.getDate() + 1);
                sArrDateStr = nextD.toISOString().split('T')[0];
              }
              const sArrTime = s.arrivalTime && !s.arrivalTime.includes('T') ? `${sArrDateStr}T${s.arrivalTime}:00` : (s.arrivalTime || formattedArrivalTime);
              return {
                airline: formatAirlineName(s.airline || sf.airline),
                flightNo: s.flightNo || sf.flightNo,
                origin: s.origin,
                destination: s.destination,
                departureTime: sDepTime,
                arrivalTime: sArrTime,
                departureTerminal: s.departureTerminal || '',
                arrivalTerminal: s.arrivalTerminal || ''
              };
            }) : [];

            return {
              _id: `SF_${sf._id}`,
              airline: formatAirlineName(sf.airline),
              airlineLogo: `https://pics.avs.io/200/200/${getAirlineCode(sf.airline)}.png`,
              flightNumber: sf.flightNo || 'SF-1107',
              departureCity: sf.origin,
              departureAirportCode: sf.origin,
              arrivalCity: sf.destination,
              arrivalAirportCode: sf.destination,
              departureTime: depTime,
              arrivalTime: formattedArrivalTime,
              departureTerminal: sf.departureTerminal || (sf.segments?.[0]?.departureTerminal) || '',
              arrivalTerminal: sf.arrivalTerminal || (sf.segments?.[sf.segments.length - 1]?.arrivalTerminal) || '',
              durationMinutes: durationMinutes > 0 ? durationMinutes : 135,
              dayChange: calculatedDayChange,
              price: price,
              adultPrice: sf.adtFare + (finalCommission / (adultCount + childCount + infantCount)),
              childPrice: sf.chdFare + (finalCommission / (adultCount + childCount + infantCount)),
              infantPrice: sf.infFare,
              stops: (sf.segments && sf.segments.length > 1) ? sf.segments.length - 1 : (sf.stops || 0),
              isConnecting: Boolean(sf.segments && sf.segments.length > 1),
              segments: mappedSegments,
              isSeriesFare: true,
              seriesFareId: sf.sfId,
              airlinePnr: sf.airlinePnr,
              availableSeats: sf.availableSeats,
              baseFare: basePrice,
              agentCommission: finalCommission,
              agentMarkup: 0,
              commissionPerPassenger: finalCommission / (adultCount + childCount + infantCount),
              refundable: 'Non Refundable',
              fareRules: [{ fareRuleDetail: 'Series / Fixed Departure fares are 100% Non-Refundable.' }],
              checkinBaggage: '15 Kg',
              cabinBaggage: '7 Kg',
              supplierId: supplier ? supplier._id : null,
              _supplierObj: supplier
            };
          });

        sfMapped = sfMapped.filter((f: any) => {
          if (f._supplierObj) {
            return f._supplierObj.isActive && isFlightAllowedByCUG(f._supplierObj, f.airline);
          }
          return true;
        }).map((f: any) => {
          delete f._supplierObj;
          return f;
        });

        // Deduplicate identical flights
        const seenSfKeys = new Set<string>();
        return sfMapped.filter((f: any) => {
          const key = `${f.flightNumber}_${f.departureTime}_${f.arrivalTime}_${f.price}`;
          if (seenSfKeys.has(key)) return false;
          seenSfKeys.add(key);
          return true;
        });
      } catch (sfErr) {
        console.error("Error fetching series fares:", sfErr);
        return [];
      }
    };

    // Sub-Task 3: GAPI Infotech
    const fetchGapi = async (): Promise<any[]> => {
      if (isAirIqOnlyMode() || !gapiSupplier || !gapiSupplier.isActive) return [];
      try {
        const gapiSearchResult = await searchFlightsGapi({ query: queryParams });
        if (!gapiSearchResult || !gapiSearchResult.length) return [];
        const onwardFlights = gapiSearchResult[0] || [];
        const gapiList: any[] = [];

        onwardFlights.forEach((onward: any) => {
          if (!onward) return;
          const leg = onward.segments[0][0];
          const lastLeg = onward.segments[0][onward.segments[0].length - 1];
          const depTime = leg.origin.depTime;
          const arrTime = lastLeg.destination.arrTime;
          const durationMinutes = leg.duration || 120;
          let basePrice = onward.fare.publishedFare;

          let finalCommission = 0;
          if (gapiSupplier && gapiSupplier.commission) {
            const percComm = (basePrice * gapiSupplier.commission.percentage) / 100;
            finalCommission = Math.max(percComm, gapiSupplier.commission.fixedAmount);
          }
          const revPolicy = applyAdminRevenuePolicy(basePrice, leg.airline.airlineCode);
          if (revPolicy.commission > 0) finalCommission = revPolicy.commission;

          const price = Math.round(basePrice + finalCommission + revPolicy.markup);
          const airlineCode = (leg.airline?.airlineCode || '6E').trim().toUpperCase();
          const GAPI_AIRLINE_NAMES: Record<string, string> = {
            '6E': 'IndiGo', 'AI': 'Air India', 'IX': 'Air India Express', 'SG': 'SpiceJet',
            'UK': 'Vistara', 'QP': 'Akasa Air', 'LH': 'Lufthansa', 'EK': 'Emirates',
            'QR': 'Qatar Airways', 'EY': 'Etihad Airways', 'SQ': 'Singapore Airlines',
            'BA': 'British Airways', 'FZ': 'flydubai', 'G8': 'Go First'
          };
          const airlineFullName = GAPI_AIRLINE_NAMES[airlineCode] || leg.airline?.airlineName || airlineCode;
          const flightNumberStr = `${airlineCode}-${leg.airline?.flightNumber || ''}`;

          const adultBreakdown = onward.fareBreakdown?.find((fb: any) => fb.passengerType === 1);
          const childBreakdown = onward.fareBreakdown?.find((fb: any) => fb.passengerType === 2);
          const infantBreakdown = onward.fareBreakdown?.find((fb: any) => fb.passengerType === 3);

          const totalPax = (adultCount || 1) + (childCount || 0) + (infantCount || 0);
          const markupPerPax = (finalCommission + revPolicy.markup) / (totalPax || 1);

          let adtFare = adultBreakdown 
            ? (adultBreakdown.totalFare ?? adultBreakdown.offeredFare ?? adultBreakdown.publishedFare ?? adultBreakdown.baseFare)
            : (onward.fare.publishedFare / (adultCount || 1));
          let chdFare = childBreakdown
            ? (childBreakdown.totalFare ?? childBreakdown.offeredFare ?? childBreakdown.publishedFare ?? childBreakdown.baseFare)
            : (childCount > 0 ? adtFare : 0);
          let infFare = infantBreakdown
            ? (infantBreakdown.totalFare ?? infantBreakdown.offeredFare ?? infantBreakdown.publishedFare ?? infantBreakdown.tax ?? 0)
            : 0;

          const adultPrice = Math.round(adtFare + markupPerPax);
          const childPrice = childCount > 0 ? Math.round(chdFare + markupPerPax) : 0;
          const infantPrice = infantCount > 0 ? Math.round(infFare) : 0;

          const outboundSegments = (onward.segments[0] || []).map((s: any) => ({
            airline: s.airline?.airlineName || airlineFullName,
            flightNo: `${(s.airline?.airlineCode || airlineCode).trim()}-${(s.airline?.flightNumber || leg.airline?.flightNumber || '').trim()}`,
            origin: s.origin?.airport?.airportCode || s.origin?.airportCode || leg.origin.airport.airportCode,
            destination: s.destination?.airport?.airportCode || s.destination?.airportCode || lastLeg.destination.airport.airportCode,
            departureTime: s.origin?.depTime || depTime,
            arrivalTime: s.destination?.arrTime || arrTime,
            duration: s.duration || durationMinutes,
            departureTerminal: s.origin?.airport?.terminal || '1',
            arrivalTerminal: s.destination?.airport?.terminal || '1'
          }));

          let returnFlightObj: any = null;
          if (onward.segments && onward.segments.length > 1 && onward.segments[1]?.length > 0) {
            const retLegs = onward.segments[1];
            const retFirstLeg = retLegs[0];
            const retLastLeg = retLegs[retLegs.length - 1];
            const retAirlineCode = (retFirstLeg.airline?.airlineCode || airlineCode).trim().toUpperCase();
            const retAirlineFullName = GAPI_AIRLINE_NAMES[retAirlineCode] || retFirstLeg.airline?.airlineName || retAirlineCode;
            const retFlightNumberStr = `${retAirlineCode}-${retFirstLeg.airline?.flightNumber || ''}`;
            const retDepTime = retFirstLeg.origin?.depTime;
            const retArrTime = retLastLeg.destination?.arrTime;
            const retDurationMinutes = retLegs.reduce((acc: number, l: any) => acc + (l.duration || 0), 0) || 120;

            const returnSegments = retLegs.map((s: any) => ({
              airline: s.airline?.airlineName || retAirlineFullName,
              flightNo: `${(s.airline?.airlineCode || retAirlineCode).trim()}-${(s.airline?.flightNumber || retFirstLeg.airline?.flightNumber || '').trim()}`,
              origin: s.origin?.airport?.airportCode || s.origin?.airportCode || retFirstLeg.origin?.airport?.airportCode,
              destination: s.destination?.airport?.airportCode || s.destination?.airportCode || retLastLeg.destination?.airport?.airportCode,
              departureTime: s.origin?.depTime || retDepTime,
              arrivalTime: s.destination?.arrTime || retArrTime,
              duration: s.duration || retDurationMinutes,
              departureTerminal: s.origin?.airport?.terminal || '1',
              arrivalTerminal: s.destination?.airport?.terminal || '1'
            }));

            returnFlightObj = {
              _id: `GAPI_RET_${onward.resultSessionId}`,
              airline: retAirlineFullName,
              airlineCode: retAirlineCode,
              airlineLogo: `https://pics.avs.io/200/200/${retAirlineCode}.png`,
              flightNumber: retFlightNumberStr,
              flightNo: retFlightNumberStr,
              segments: returnSegments,
              departureCity: retFirstLeg.origin?.airport?.cityCode || retFirstLeg.origin?.airportCode,
              departureAirportCode: retFirstLeg.origin?.airport?.airportCode || retFirstLeg.origin?.airportCode,
              arrivalCity: retLastLeg.destination?.airport?.cityCode || retLastLeg.destination?.airportCode,
              arrivalAirportCode: retLastLeg.destination?.airport?.airportCode || retLastLeg.destination?.airportCode,
              departureTime: retDepTime,
              arrivalTime: retArrTime,
              durationMinutes: retDurationMinutes,
              price: 0,
              adultPrice: 0,
              childPrice: 0,
              infantPrice: 0,
              stops: retLegs.length - 1,
              isGapiFare: true,
              isRoundTripComboReturn: true,
              resultSessionId: onward.resultSessionId,
              fareIdentifire: onward.fare.fareIdentifire,
              availableSeats: retFirstLeg.noOfSeatAvailable || 9,
              baseFare: 0,
              agentCommission: 0,
              agentMarkup: 0,
              refundable: onward.refundable || 'Non Refundable',
              fareRules: onward.fareRules || (onward.refundable ? [{ fareRuleDetail: onward.refundable }] : []),
              checkinBaggage: retFirstLeg.baggage || '15 Kg',
              cabinBaggage: retFirstLeg.cabinBaggage || '7 Kg',
              supplierId: gapiSupplier?._id
            };
          }

          const allSegments = returnFlightObj ? [...outboundSegments, ...(returnFlightObj.segments || [])] : outboundSegments;

          gapiList.push({
            _id: `GAPI_${onward.resultSessionId}`,
            airline: airlineFullName,
            airlineCode: airlineCode,
            airlineLogo: `https://pics.avs.io/200/200/${airlineCode}.png`,
            flightNumber: flightNumberStr,
            flightNo: flightNumberStr,
            segments: outboundSegments,
            allSegments: allSegments,
            returnFlight: returnFlightObj,
            isRoundTripCombo: Boolean(returnFlightObj),
            departureCity: leg.origin.airport.cityCode,
            departureAirportCode: leg.origin.airport.airportCode,
            arrivalCity: lastLeg.destination.airport.cityCode,
            arrivalAirportCode: lastLeg.destination.airport.airportCode,
            departureTime: depTime,
            arrivalTime: arrTime,
            durationMinutes: durationMinutes,
            price: price,
            adultPrice: adultPrice,
            childPrice: childPrice,
            infantPrice: infantPrice,
            stops: onward.segments[0].length - 1,
            isGapiFare: true,
            resultSessionId: onward.resultSessionId,
            fareIdentifire: onward.fare.fareIdentifire,
            availableSeats: leg.noOfSeatAvailable || 9,
            baseFare: basePrice,
            agentCommission: finalCommission,
            agentMarkup: 0,
            refundable: onward.refundable || 'Non Refundable',
            fareRules: onward.fareRules || (onward.refundable ? [{ fareRuleDetail: onward.refundable }] : []),
            checkinBaggage: leg.baggage || '15 Kg',
            cabinBaggage: leg.cabinBaggage || '7 Kg',
            supplierId: gapiSupplier?._id
          });
        });

        return gapiList.filter((f: any) => isFlightAllowedByCUG(gapiSupplier, f.airline));
      } catch (err: any) {
        console.warn("[GAPI] Live fare search unavailable:", err.message || err);
        return [];
      }
    };

    // Sub-Task 4: AirIQ
    const fetchAirIq = async (): Promise<any[]> => {
      const shouldSearch = airIqSupplier && (isAirIqOnlyMode() || (airIqSupplier.isActive && airIqSupplier.searchEnabled !== false));
      if (!shouldSearch) return [];
      try {
        const yyyy = targetDate.getFullYear();
        const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
        const dd = String(targetDate.getDate()).padStart(2, '0');
        const airIqDepDate = `${yyyy}/${mm}/${dd}`;

        const airIqResult = await searchFlightsAirIq({
          origin: originIata,
          destination: destinationIata,
          departure_date: airIqDepDate,
          adult: adultCount,
          child: childCount,
          infant: infantCount,
          airline_code: queryParams.airline || queryParams.airlineCode
        });

        if (airIqResult && (airIqResult.status === 'success' || airIqResult.code === '200') && Array.isArray(airIqResult.data)) {
          const mapped = airIqResult.data.map((flight: any) => {
            const flightNoParts = (flight.flight_number || '').trim().split(' ');
            const airlineCode = flightNoParts[0]?.toUpperCase() || 'SG';

            const depDateStr = (flight.departure_date || airIqDepDate).replace(/\//g, '-');
            const arrDateStr = (flight.arival_date || flight.departure_date || airIqDepDate).replace(/\//g, '-');
            const depDateTime = `${depDateStr}T${flight.departure_time || '00:00'}:00+05:30`;
            const arrDateTime = `${arrDateStr}T${flight.arival_time || '00:00'}:00+05:30`;

            const depMs = new Date(depDateTime).getTime();
            const arrMs = new Date(arrDateTime).getTime();
            const durationMinutes = (!isNaN(depMs) && !isNaN(arrMs) && arrMs > depMs)
              ? Math.round((arrMs - depMs) / 60000)
              : 135;

            const basePrice = Math.round(Number(flight.price || 0) * (adultCount + childCount));

            let finalCommission = 0;
            if (airIqSupplier && airIqSupplier.commission) {
              const percComm = (basePrice * (airIqSupplier.commission.percentage || 0)) / 100;
              finalCommission = Math.max(percComm, airIqSupplier.commission.fixedAmount || 0);
            }
            const revPolicy = applyAdminRevenuePolicy(basePrice, airlineCode);
            if (revPolicy.commission > 0) finalCommission = revPolicy.commission;

            const totalPrice = Math.round(basePrice + finalCommission + revPolicy.markup);
            const perPaxMarkup = (finalCommission + revPolicy.markup) / Math.max(1, (adultCount + childCount));

            const adultTotal = Math.round(Number(flight.price || 0) + perPaxMarkup);
            const baseFarePerPax = Math.round(adultTotal * 0.72);
            const taxesPerPax = adultTotal - baseFarePerPax;
            const fuelSurcharge = Math.round(taxesPerPax * 0.58);
            const airportDevelopmentFee = Math.round(taxesPerPax * 0.24);
            const govtTaxes = taxesPerPax - fuelSurcharge - airportDevelopmentFee;

            const formatBaggage = (val: any, fallbackKg: number): string => {
              if (!val) return `${fallbackKg} Kg`;
              const s = String(val).trim();
              const num = parseInt(s, 10);
              if (!isNaN(num) && num > 0) return `${num} Kg`;
              return s.endsWith('Kg') || s.endsWith('kg') ? s : `${s} Kg`;
            };

            const chkInBag = formatBaggage(flight.cabin_baggage, 15);
            const cabBag = formatBaggage(flight.hand_luggage, 7);

            return {
              _id: `AIRIQ_${flight.ticket_id}`,
              airline: flight.airline || 'AirIQ Partner',
              airlineCode,
              airlineLogo: `https://pics.avs.io/200/200/${airlineCode}.png`,
              flightNumber: flight.flight_number || `${airlineCode}-AIQ`,
              departureCity: flight.origin || originIata,
              departureAirportCode: flight.origin || originIata,
              arrivalCity: flight.destination || destinationIata,
              arrivalAirportCode: flight.destination || destinationIata,
              departureTime: depDateTime,
              arrivalTime: arrDateTime,
              durationMinutes,
              price: totalPrice,
              stops: (flight.flight_route || '').toLowerCase().includes('non') ? 0 : 1,
              seatsAvailable: flight.pax || 9,
              adultPrice: adultTotal,
              childPrice: Math.round(Number(flight.price || 0) + perPaxMarkup),
              infantPrice: Number(flight.infant_price || 2250),
              baseFare: baseFarePerPax * adultCount,
              baseFarePerPax,
              taxes: taxesPerPax * adultCount,
              taxesPerPax,
              taxBreakdown: {
                fuelSurcharge: fuelSurcharge * adultCount,
                airportDevelopmentFee: airportDevelopmentFee * adultCount,
                govtTaxes: govtTaxes * adultCount
              },
              checkinBaggage: chkInBag,
              cabinBaggage: cabBag,
              cabinClass: 'Economy',
              refundable: 'Non Refundable',
              isAirIqFare: true,
              airIq_ticket_id: flight.ticket_id,
              // Stripped airIq_raw to free heap memory on 2GB VPS
              supplierId: airIqSupplier?._id,
              agentCommission: finalCommission,
              agentMarkup: 0,
              fareRules: [
                {
                  ruleType: 'CANCELLATION',
                  fareRuleDetail: 'AirIQ Series Fare (Fixed Departure): Strictly 100% Non-Refundable upon cancellation. No refund of base fare or fuel surcharges as per airline contract terms.'
                },
                {
                  ruleType: 'DATE_CHANGE',
                  fareRuleDetail: 'Date Change & Rescheduling: Date change and name change are not permitted on Series / Group promotional block inventory.'
                },
                {
                  ruleType: 'BAGGAGE',
                  fareRuleDetail: `Baggage Allowance: Cabin Baggage: ${cabBag} / pax | Check-in Baggage: ${chkInBag} / pax. Excess baggage can be purchased at airport check-in counters.`
                },
                {
                  ruleType: 'SEATS_MEALS',
                  fareRuleDetail: 'Seats & Meals: Standard economy seats are assigned at airport check-in or via airline web check-in. Paid meals can be pre-booked directly on the airline portal.'
                }
              ]
            };
          });

          if (!isAirIqOnlyMode()) {
            return mapped.filter((f: any) =>
              isFlightAllowedByCUG(airIqSupplier, f.airline) || isFlightAllowedByCUG(airIqSupplier, f.airlineCode)
            );
          }
          return mapped;
        }
        return [];
      } catch (airIqErr: any) {
        console.warn('[AirIQ] Live fare search unavailable:', airIqErr.response?.data?.message || airIqErr.message || airIqErr);
        return [];
      }
    };

    // Sub-Task 5: Standard DB Inventory Flights
    const fetchDbFlights = async (): Promise<any[]> => {
      if (isAirIqOnlyMode()) return [];
      try {
        const exactDayStart = new Date(targetDate);
        exactDayStart.setUTCHours(0, 0, 0, 0);
        const startOfDay = new Date(exactDayStart.getTime() - (6 * 3600 * 1000));
        const endOfDay = new Date(exactDayStart.getTime() + (23 * 3600 * 1000 + 59 * 60 * 1000));

        const dbFilter: any = {
          departureAirportCode: { $regex: new RegExp(getAirportCodeRegex(originIata), 'i') },
          arrivalAirportCode: { $regex: new RegExp(getAirportCodeRegex(destinationIata), 'i') },
          departureTime: { $gte: startOfDay, $lte: endOfDay }
        };

        const dbFlights = await Flight.find(dbFilter).lean();
        return dbFlights.map((f: any) => ({
          ...f,
          price: f.price * (adultCount + childCount) + (infantCount > 0 ? (f.price * 0.2 * infantCount) : 0),
          isInventoryFare: true,
          agentCommission: 0,
          agentMarkup: 0
        }));
      } catch (dbErr) {
        console.error("Error fetching standard db flights:", dbErr);
        return [];
      }
    };

    // Run all 5 supplier queries concurrently with Promise.allSettled
    const supplierResults = await Promise.allSettled([
      fetchNexus(),
      fetchSeriesFares(),
      fetchGapi(),
      fetchAirIq(),
      fetchDbFlights()
    ]);

    let flights: any[] = [];
    for (const res of supplierResults) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        flights.push(...res.value);
      }
    }

    // Apply user filters
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
      travelDate: { $gte: startOfDay },
      availableSeats: { $gt: 0 },
      isTestFlight: { $ne: true }
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

    // Get Admin config for caching timeout
    const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('resultExpiryTime').lean();
    const expiryMins = admin?.resultExpiryTime || 20; // Default 20 mins

    const originIata = getIataCode((req.query.from as string) || '');
    const destinationIata = getIataCode((req.query.to as string) || '');
    const adultCount = Number(req.query.adults) || Number(req.query.passengers) || 1;
    const childCount = Number(req.query.children) || 0;
    const infantCount = Number(req.query.infants) || 0;
    const cabin = (req.query.cabinClass as string) || 'ALL';
    const travelDate = (req.query.date as string) || '';
    const airIqMode = isAirIqOnlyMode() ? 'AIRIQ' : 'ALL';
    const isTestMode = req.query.isTestFlight === 'true' || req.query.sandbox === 'true' || req.query.mode === 'TEST' ? 'TEST' : 'LIVE';

    // Shared wholesale cache key without agentId so all agents reuse identical supplier inventory
    const cacheKey = `FLIGHT_${originIata}_${destinationIata}_${travelDate}_${adultCount}_${childCount}_${infantCount}_${cabin}_${airIqMode}_${isTestMode}`;
    const cachedResult = flightSearchCache.get(cacheKey);

    if (cachedResult && (Date.now() - cachedResult.timestamp < expiryMins * 60 * 1000)) {
      console.log(`[CACHE HIT] Returning cached flights for ${cacheKey}. Expiry is set to ${expiryMins} mins.`);
      return res.json(cachedResult.data);
    }

    // Request Coalescing (In-flight promise deduplication for concurrent identical searches)
    let searchPromise = inFlightSearches.get(cacheKey);
    if (!searchPromise) {
      console.log(`[CACHE MISS] Fetching fresh flights for ${cacheKey}...`);
      searchPromise = getFlightsData(req.query, isAgent, agentId)
        .then((flights) => {
          if (flights && flights.length > 0) {
            flightSearchCache.set(cacheKey, { data: flights, timestamp: Date.now() });
          }
          return flights;
        })
        .finally(() => {
          inFlightSearches.delete(cacheKey);
        });
      inFlightSearches.set(cacheKey, searchPromise);
    } else {
      console.log(`[COALESCED] Attaching to in-flight search promise for ${cacheKey}`);
    }

    const flights = await searchPromise;
    res.json(flights);
  } catch (error: any) {
    console.error("Flight Search Catch Error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const clearFlightSearchCache = () => {
  flightSearchCache.clear();
  inFlightSearches.clear();
};

// @desc    Check Flight Availability
// @route   POST /api/searches/flights/check
// @access  Public
export const checkFlightAvailability = async (req: AuthRequest, res: Response) => {
  try {
    const { flight } = req.body;

    if (!flight) {
      return res.status(400).json({ message: "Flight object is missing from checkout request" });
    }

    // --- Dynamic Supplier Routing Strategy ---

    // 1. Series Fares
    if (flight.isSeriesFare) {
      // In the future: Add Series Fare seat lock/check logic here
      return res.json({ success: true, price: flight.price });
    }

    // 2. GAPI Flights
    if (flight.isGapiFare || flight.supplierObj?.name === 'GAPI INFOTECH' || (flight._id && flight._id.startsWith('GAPI'))) {
      const { fareQuote } = require('../flights/gapi.service');
      const searchSessionId = (flight._id && flight._id.startsWith('GAPI_')) 
        ? flight._id.replace('GAPI_', '') 
        : (flight.searchSessionId || flight.resultSessionId);

      const quoteRes = await fareQuote(searchSessionId);
      
      if (!quoteRes || !quoteRes.success) {
        return res.status(400).json({ message: quoteRes?.error_msg || "Flight is no longer available via GAPI" });
      }
      const updatedSessionId = quoteRes._data?.results?.resultSessionId || quoteRes._data?.results?.[0]?.resultSessionId || flight.resultSessionId;
      return res.json({ success: true, resultSessionId: updatedSessionId, searchSessionId, _data: quoteRes._data });
    }

    // AirIQ Flights
    if (flight.isAirIqFare || flight.supplierObj?.name === 'Air Iq' || (flight._id && flight._id.startsWith('AIRIQ_')) || flight.airIq_ticket_id) {
      const ticketId = flight.airIq_ticket_id || (flight._id && flight._id.startsWith('AIRIQ_') ? flight._id.replace('AIRIQ_', '') : null);
      if (!ticketId) {
        return res.status(400).json({ message: "AirIQ flight ticket token expired or missing. Please search again." });
      }
      return res.json({ success: true, available: true, price: flight.price, airIq_ticket_id: ticketId });
    }

    // 3. Default: Nexus DMC Flights
    if (flight.nexus_query) {
      const availResult = await checkAvailability(flight.nexus_query, [flight._id], flight.price, 'INR');
      if (!availResult || !availResult.success) {
        return res.status(400).json({ message: availResult?.error_msg || "Flight is no longer available via Nexus DMC" });
      }
      return res.json(availResult._data);
    }

    // Fallback if supplier is unknown
    return res.json({ success: true, price: flight.price });

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
    const sfFlights = !isAirIqOnlyMode() ? await SeriesFare.find({
      origin: { $regex: new RegExp(getAirportCodeRegex(originIata), 'i') },
      destination: { $regex: new RegExp(getAirportCodeRegex(destinationIata), 'i') },
      status: { $regex: new RegExp('^Active$', 'i') },
      travelDate: { $gte: today, $lte: endDate },
      availableSeats: { $gt: 0 },
      isTestFlight: { $ne: true }
    }).lean() : [];

    // 2. Fetch from standard DB Flights
    const dbFlights = !isAirIqOnlyMode() ? await Flight.find({
      departureAirportCode: { $regex: new RegExp(getAirportCodeRegex(originIata), 'i') },
      arrivalAirportCode: { $regex: new RegExp(getAirportCodeRegex(destinationIata), 'i') },
      departureTime: { $gte: today, $lte: endDate }
    }).lean() : [];

    console.log(`Calendar Prices API: origin=${origin} (${originIata}), dest=${destination} (${destinationIata})`);
    console.log(`Calendar Prices API: Found ${dbFlights.length} standard flights and ${sfFlights.length} series fares`);

    const pricesMap: Record<string, any> = {};

    const formatDateStr = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Fetch all active suppliers for commission calculation
    const calSuppliers = await Supplier.find({ isActive: true }).lean();

    // Group Series Fares (Fixed Departures with available seats)
    sfFlights.forEach((sf: any) => {
      if (!sf.travelDate) return;
      const dateStr = formatDateStr(new Date(sf.travelDate));
      
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
      
      const price = Math.round((Number(sf.adtFare) || 0) + commission);
      const prev = pricesMap[dateStr];
      const prevPrice = typeof prev === 'object' && prev !== null ? prev.price : prev;

      if (!prevPrice || price < prevPrice) {
        pricesMap[dateStr] = {
          price: price,
          seats: sf.availableSeats || 0,
          isFD: true,
          airline: sf.airline,
          flightNo: sf.flightNo
        };
      }
    });

    // Group Standard Flights
    dbFlights.forEach((f: any) => {
      if (!f.departureTime) return;
      const dateStr = formatDateStr(new Date(f.departureTime));
      const price = Math.round(f.price || 0);
      const prev = pricesMap[dateStr];
      const prevPrice = typeof prev === 'object' && prev !== null ? prev.price : prev;

      if (!prevPrice || price < prevPrice) {
        if (!prev || !prev.isFD) {
          pricesMap[dateStr] = {
            price: price,
            seats: f.availableSeats || null,
            isFD: false,
            airline: f.airline,
            flightNo: f.flightNumber
          };
        }
      }
    });

    // 3. Fetch from NexusDMC (only dates available)
    if (!isAirIqOnlyMode()) {
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
    }

    // 4. AirIQ dates: Do not mark dates as '-1' (Available) without prices to prevent confusing users
    // Dates will cleanly display real prices when searched, or '--' otherwise.

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

    if (isAirIqOnlyMode()) {
      // In AirIQ-only mode, prioritize AirIQ operational sectors so user can pick valid AirIQ routes
      try {
        const airIqSectors = await getAvailableSectorsAirIq();
        if (Array.isArray(airIqSectors)) {
          for (const s of airIqSectors) {
            if (s.Origin) availableCodes.add(s.Origin.toUpperCase());
            if (s.Destination) availableCodes.add(s.Destination.toUpperCase());
          }
        }
      } catch (airIqErr) {}
      if (availableCodes.size === 0) {
        ['DEL', 'BOM', 'BLR', 'MAA', 'CCU', 'HYD', 'GOI', 'IXG', 'ATQ', 'SXR', 'IXB'].forEach(c => availableCodes.add(c));
      }
    } else {
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

    // From AirIQ API sectors
    try {
      const airIqSectors = await getAvailableSectorsAirIq();
      if (Array.isArray(airIqSectors)) {
        for (const s of airIqSectors) {
          if (s.Origin) availableCodes.add(s.Origin.toUpperCase());
          if (s.Destination) availableCodes.add(s.Destination.toUpperCase());
        }
      }
    } catch (airIqErr) {}
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

// @desc    Get top flight routes based on most booked flights in the platform
// @route   GET /api/searches/flights/top-routes
// @access  Public
export const getTopFlightRoutes = async (req: Request, res: Response) => {
  try {
    const CITY_MAP: Record<string, string> = {
      'NEW DELHI': 'DEL', 'DELHI': 'DEL', 'DEL': 'DEL',
      'MUMBAI': 'BOM', 'BOM': 'BOM',
      'BANGALORE': 'BLR', 'BENGALURU': 'BLR', 'BLR': 'BLR',
      'GOA': 'GOI', 'GOI': 'GOI', 'GOX': 'GOI',
      'KOLKATA': 'CCU', 'CALCUTTA': 'CCU', 'CCU': 'CCU',
      'HYDERABAD': 'HYD', 'HYD': 'HYD',
      'CHENNAI': 'MAA', 'MADRAS': 'MAA', 'MAA': 'MAA',
      'JAIPUR': 'JAI', 'JAI': 'JAI',
      'AHMEDABAD': 'AMD', 'AMD': 'AMD',
      'PUNE': 'PNQ', 'PNQ': 'PNQ',
      'CHANDIGARH': 'IXC', 'IXC': 'IXC',
      'AMRITSAR': 'ATQ', 'ATQ': 'ATQ',
      'LUCKNOW': 'LKO', 'LKO': 'LKO',
      'VARANASI': 'VNS', 'VNS': 'VNS',
      'SRINAGAR': 'SXR', 'SXR': 'SXR',
      'KOCHI': 'COK', 'COK': 'COK',
      'DUBAI': 'DXB', 'DXB': 'DXB',
      'BALI': 'DPS', 'DENPASAR': 'DPS', 'DPS': 'DPS',
      'BANGKOK': 'BKK', 'BKK': 'BKK',
      'KUALA LUMPUR': 'KUL', 'KUL': 'KUL',
      'SINGAPORE': 'SIN', 'SIN': 'SIN',
      'NAVI MUMBAI': 'NMI', 'NMI': 'NMI'
    };

    const CODE_TO_NAME: Record<string, string> = {
      'DEL': 'Delhi', 'BOM': 'Mumbai', 'BLR': 'Bangalore', 'GOI': 'Goa',
      'CCU': 'Kolkata', 'HYD': 'Hyderabad', 'MAA': 'Chennai', 'JAI': 'Jaipur',
      'AMD': 'Ahmedabad', 'PNQ': 'Pune', 'IXC': 'Chandigarh', 'ATQ': 'Amritsar',
      'LKO': 'Lucknow', 'VNS': 'Varanasi', 'SXR': 'Srinagar', 'COK': 'Kochi',
      'DXB': 'Dubai', 'DPS': 'Bali', 'BKK': 'Bangkok', 'KUL': 'Kuala Lumpur',
      'SIN': 'Singapore', 'NMI': 'Navi Mumbai'
    };

    // 1. Fetch flight bookings from the database to rank the most booked routes
    const flightBookings = await Booking.find({ 
      type: 'FLIGHT', 
      status: { $ne: 'FAILED' } 
    })
      .select('details')
      .lean();

    const routeCounts: Record<string, { codeFrom: string; codeTo: string; from: string; to: string; count: number }> = {};

    for (const b of flightBookings) {
      let rawFrom = (b.details?.from || (b.details as any)?.origin || '').trim().toUpperCase();
      let rawTo = (b.details?.to || (b.details as any)?.destination || '').trim().toUpperCase();
      const from = CITY_MAP[rawFrom] || rawFrom;
      const to = CITY_MAP[rawTo] || rawTo;
      if (from && to && from !== to) {
        const key = `${from}_${to}`;
        if (!routeCounts[key]) {
          routeCounts[key] = {
            codeFrom: from,
            codeTo: to,
            from: CODE_TO_NAME[from] || from,
            to: CODE_TO_NAME[to] || to,
            count: 0
          };
        }
        routeCounts[key].count += 1;
      }
    }

    let topRoutes = Object.values(routeCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // If fewer than 10 routes in bookings, supplement with active Series Fares
    if (topRoutes.length < 10) {
      const existingKeys = new Set(topRoutes.map(r => `${r.codeFrom}_${r.codeTo}`));
      
      const sfRoutes = await SeriesFare.aggregate([
        { $match: { status: 'Active', isArchived: false, travelDate: { $gte: new Date() } } },
        { $group: { _id: { origin: '$origin', destination: '$destination' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);

      for (const sf of sfRoutes) {
        const from = (sf._id?.origin || '').toUpperCase();
        const to = (sf._id?.destination || '').toUpperCase();
        const key = `${from}_${to}`;
        if (from && to && from !== to && !existingKeys.has(key)) {
          existingKeys.add(key);
          topRoutes.push({
            codeFrom: from,
            codeTo: to,
            from: CODE_TO_NAME[from] || from,
            to: CODE_TO_NAME[to] || to,
            count: sf.count || 1
          });
          if (topRoutes.length >= 10) break;
        }
      }
    }

    res.json(topRoutes.slice(0, 10));
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
