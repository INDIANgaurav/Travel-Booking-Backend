import mongoose, { Document, Schema } from 'mongoose';

export interface IAirport extends Document {
  iataCode: string;
  name: string;
  cityCode: string;
  countryCode: string;
  timezone: string;
  active: boolean;
}

const airportSchema = new Schema<IAirport>(
  {
    iataCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    cityCode: { type: String, required: true, uppercase: true, trim: true },
    countryCode: { type: String, required: true, uppercase: true, trim: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

airportSchema.index({ countryCode: 1, active: 1 });

export const Airport = mongoose.model<IAirport>('Airport', airportSchema);

// Comprehensive Indian commercial/regional IATA airport master codes (DGCA/AAI network)
const INDIAN_AIRPORTS = new Set([
  'AGX', 'AMD', 'AJL', 'AKD', 'IXD', 'ATQ', 'IXU', 'AYJ', 'BBI', 'BDQ', 'BEK', 'BEP', 'BHO',
  'BHJ', 'BHU', 'BIH', 'BKB', 'BLR', 'BOM', 'BPR', 'BUP', 'CBD', 'CCJ', 'CCU', 'CDP', 'CJB',
  'CNN', 'COH', 'COK', 'DAE', 'DAI', 'DBR', 'DED', 'DEL', 'DEP', 'DGH', 'DHM', 'DIB', 'DIU',
  'DMU', 'DOB', 'DXN', 'GAY', 'GAU', 'GDB', 'GOI', 'GOP', 'GOX', 'GUX', 'GWL', 'HBX', 'HJR',
  'HSS', 'HYD', 'IDR', 'IMF', 'ISK', 'IXA', 'IXB', 'IXC', 'IXE', 'IXG', 'IXI', 'IXJ', 'IXK',
  'IXL', 'IXM', 'IXN', 'IXP', 'IXQ', 'IXR', 'IXS', 'IXT', 'IXV', 'IXW', 'IXY', 'IXZ', 'JAI',
  'JDH', 'JGA', 'JGB', 'JLR', 'JRH', 'JRG', 'JSA', 'KJB', 'KLH', 'KNU', 'KQH', 'KTU', 'KUU',
  'LDA', 'LKO', 'LUH', 'MAA', 'MOH', 'MYQ', 'MZA', 'MZU', 'NAG', 'NDC', 'NMI', 'NVY', 'OMN',
  'PAB', 'PAT', 'PBD', 'PGH', 'PNQ', 'PNY', 'PUT', 'PYB', 'PYG', 'RAJ', 'RDP', 'REW', 'RGH',
  'RJA', 'RJI', 'RPR', 'RRK', 'RTC', 'RUP', 'SAG', 'SXV', 'SHL', 'SHW', 'SLV', 'SSE', 'STV',
  'SXR', 'TEI', 'TEZ', 'TIR', 'TJZ', 'TRV', 'TRZ', 'UDR', 'VGA', 'VNS', 'VTZ', 'WGC', 'ZER'
]);

// Known destination country rules for optional 6-month passport validity advisories
const COUNTRY_BY_AIRPORT: Record<string, string> = {
  DXB: 'AE', AUH: 'AE', SHJ: 'AE', DWC: 'AE', RKT: 'AE',
  DPS: 'ID', CGK: 'ID', SUB: 'ID', KNO: 'ID',
  SIN: 'SG', BKK: 'TH', DMK: 'TH', HKT: 'TH', CNX: 'TH',
  KUL: 'MY', PEN: 'MY', LGK: 'MY', HAN: 'VN', SGN: 'VN', DAD: 'VN', PQC: 'VN',
  DOH: 'QA', MCT: 'OM', RUH: 'SA', JED: 'SA', DMM: 'SA', KWI: 'KW', BAH: 'BH',
  CMB: 'LK', KTM: 'NP', MLE: 'MV', DAC: 'BD', PBH: 'BT',
  LHR: 'GB', LGW: 'GB', MAN: 'GB', CDG: 'FR', FRA: 'DE', MUC: 'DE', AMS: 'NL', ZRH: 'CH', MXP: 'IT', FCO: 'IT',
  JFK: 'US', EWR: 'US', ORD: 'US', SFO: 'US', YYZ: 'CA', YVR: 'CA',
  SYD: 'AU', MEL: 'AU', HKG: 'HK', NRT: 'JP', HND: 'JP', ICN: 'KR',
  ALA: 'KZ', TAS: 'UZ', GYD: 'AZ', TBS: 'GE', EVN: 'AM',
};

const SIX_MONTH_PASSPORT_COUNTRIES = new Set(['AE', 'ID', 'SG', 'TH', 'MY', 'VN', 'SA', 'OM', 'QA', 'MV', 'LK']);

/**
 * Resolves the ISO-3166 alpha-2 country code for an airport using the Airport master collection first,
 * falling back to the built-in DGCA/global IATA map.
 */
export async function getAirportCountryCode(iataCode: string): Promise<string | null> {
  const code = (iataCode || '').trim().toUpperCase();
  if (!code) return null;

  if (mongoose.connection.readyState === 1) {
    const dbAirport = await Airport.findOne({ iataCode: code, active: true }).select('countryCode').lean();
    if (dbAirport?.countryCode) {
      return dbAirport.countryCode.toUpperCase();
    }
  }

  if (INDIAN_AIRPORTS.has(code)) return 'IN';
  if (COUNTRY_BY_AIRPORT[code]) return COUNTRY_BY_AIRPORT[code];
  return null;
}

/**
 * Checks whether an itinerary (including connecting segments) is purely domestic within the same country.
 */
export async function isDomesticItinerary(
  origin: string,
  destination: string,
  segments?: Array<{ origin?: string; destination?: string }>
): Promise<{ isDomestic: boolean; originCountry: string | null; destinationCountry: string | null }> {
  const airportsToCheck = new Set<string>();
  if (origin) airportsToCheck.add(origin.trim().toUpperCase());
  if (destination) airportsToCheck.add(destination.trim().toUpperCase());

  if (Array.isArray(segments)) {
    for (const seg of segments) {
      if (seg.origin) airportsToCheck.add(seg.origin.trim().toUpperCase());
      if (seg.destination) airportsToCheck.add(seg.destination.trim().toUpperCase());
    }
  }

  const resolved = await Promise.all(
    Array.from(airportsToCheck).map(async (code) => ({
      code,
      country: await getAirportCountryCode(code),
    }))
  );

  const map = new Map(resolved.map((r) => [r.code, r.country]));
  const originCountry = map.get(origin.trim().toUpperCase()) || null;
  const destinationCountry = map.get(destination.trim().toUpperCase()) || null;

  const countries = resolved.map((r) => r.country).filter(Boolean);
  if (countries.length === 0 || resolved.some((r) => !r.country)) {
    return { isDomestic: false, originCountry, destinationCountry };
  }

  const allSameCountry = new Set(countries).size === 1;
  return { isDomestic: allSameCountry, originCountry, destinationCountry };
}

export interface TravelDocValidationInput {
  isDomestic: boolean;
  destinationCountry: string | null;
  travelDate: Date;
  requirePassport?: boolean;
  passportNumber?: string;
  passportExpiry?: string;
  nationality?: string;
}

export interface TravelDocValidationResult {
  valid: boolean;
  code?: string;
  message?: string;
}

/**
 * Validates travel documents contextually based on supplier/destination rules and provided fields.
 * Does not blindly require passports on every international call unless configured, but always
 * rejects expired or insufficient-validity passports when provided.
 */
export function validateTravelDocument(input: TravelDocValidationInput): TravelDocValidationResult {
  const { isDomestic, destinationCountry, travelDate, requirePassport, passportNumber, passportExpiry } = input;

  if (isDomestic && !passportNumber && !passportExpiry) {
    return { valid: true };
  }

  const hasNum = Boolean(passportNumber && passportNumber.trim());
  const hasExp = Boolean(passportExpiry && passportExpiry.trim());

  if (requirePassport && !isDomestic && (!hasNum || !hasExp)) {
    return {
      valid: false,
      code: 'PASSPORT_REQUIRED',
      message: 'Passport number and expiry date are required for this international itinerary.',
    };
  }

  if (hasNum && passportNumber!.trim().length < 5) {
    return {
      valid: false,
      code: 'INVALID_PASSPORT_NUMBER',
      message: 'Passport number must be at least 5 characters.',
    };
  }

  if (hasExp) {
    const expDate = new Date(passportExpiry!.trim());
    if (isNaN(expDate.getTime())) {
      return {
        valid: false,
        code: 'INVALID_PASSPORT_EXPIRY',
        message: 'Passport expiry date is invalid. Expected YYYY-MM-DD.',
      };
    }

    if (expDate.getTime() <= travelDate.getTime()) {
      return {
        valid: false,
        code: 'PASSPORT_EXPIRED',
        message: 'Passport expires on or before the travel date.',
      };
    }

    if (!isDomestic && destinationCountry && SIX_MONTH_PASSPORT_COUNTRIES.has(destinationCountry)) {
      const sixMonthsAfterTravel = new Date(travelDate);
      sixMonthsAfterTravel.setMonth(sixMonthsAfterTravel.getMonth() + 6);
      if (expDate.getTime() < sixMonthsAfterTravel.getTime()) {
        return {
          valid: false,
          code: 'PASSPORT_VALIDITY_INSUFFICIENT',
          message: `Destination (${destinationCountry}) generally requires at least 6 months of passport validity from the date of travel.`,
        };
      }
    }
  }

  return { valid: true };
}

