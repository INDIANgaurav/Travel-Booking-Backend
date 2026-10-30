import axios from 'axios';

const AIRIQ_BASE_URL = process.env.AIRIQ_BASE_URL || 'https://omairiq.azurewebsites.net';
const AIRIQ_API_KEY = process.env.AIRIQ_API_KEY || 'NTMzNDUwMDpBSVJJUSBURVNUIEFQSToxODkxOTMwMDM1OTk2OlBvTjE2NGNkLy9heE53WC9hM00rS1ZrcnJSa2Q0S05adHl3Q0NHZmU4Uzg9';
const AIRIQ_USERNAME = process.env.AIRIQ_USERNAME || '9555202202';
const AIRIQ_PASSWORD = process.env.AIRIQ_PASSWORD || '112233344';

// Store token in memory
let cachedToken: string = '';
let tokenExpiry: number = 0;

/**
 * Authenticates with AirIQ API and returns Bearer token.
 * Token is cached in memory until near-expiration.
 */
export const authenticateAirIq = async (): Promise<string> => {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  try {
    const response = await axios.post(
      `${AIRIQ_BASE_URL}/login`,
      {
        Username: AIRIQ_USERNAME,
        Password: AIRIQ_PASSWORD
      },
      {
        headers: {
          'api-key': AIRIQ_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    if (response.data && response.data.token) {
      cachedToken = response.data.token;
      // Expiration in seconds or fallback to 55 minutes
      const expiresInSec = response.data.expiration || 3599;
      tokenExpiry = Date.now() + ((expiresInSec - 60) * 1000); 
      return cachedToken;
    }
    throw new Error('No token found in AirIQ login response');
  } catch (error: any) {
    console.error('AirIQ Authentication Failed:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with AirIQ');
  }
};

/**
 * Fetches available flight sectors from AirIQ
 */
export const getAvailableSectorsAirIq = async (): Promise<any[]> => {
  try {
    const token = await authenticateAirIq();
    const response = await axios.get(`${AIRIQ_BASE_URL}/sectors`, {
      headers: {
        'api-key': AIRIQ_API_KEY,
        'Authorization': token,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (response.data && response.data.status === 'success' && Array.isArray(response.data.data)) {
      return response.data.data;
    }
    return [];
  } catch (error: any) {
    console.warn('AirIQ getAvailableSectors warning:', error.response?.data?.message || error.message);
    return [];
  }
};

export interface AirIqSearchPayload {
  origin: string;
  destination: string;
  departure_date: string; // YYYY/MM/DD
  adult: number;
  child?: number;
  infant?: number;
}

export interface AirIqFlightItem {
  ticket_id: string;
  origin: string;
  destination: string;
  airline: string;
  departure_date: string;
  departure_time: string;
  arival_time: string;
  arival_date: string;
  flight_number: string;
  flight_route: string;
  pax: number;
  price: number;
  infant_price: number;
  inventory_type: string | null;
  cabin_baggage: string;
  hand_luggage: string;
  isinternational: boolean;
}

/**
 * Searches flights on AirIQ with automatic endpoint fallback
 */
export const searchFlightsAirIq = async (payload: AirIqSearchPayload): Promise<any> => {
  const token = await authenticateAirIq();
  const searchBody = {
    origin: payload.origin,
    destination: payload.destination,
    departure_date: payload.departure_date,
    adult: payload.adult || 1,
    child: payload.child || 0,
    infant: payload.infant || 0
  };

  const headers = {
    'api-key': AIRIQ_API_KEY,
    'Authorization': token,
    'Content-Type': 'application/json'
  };

  try {
    // Primary endpoint: /search
    const response = await axios.post(`${AIRIQ_BASE_URL}/search`, searchBody, { headers, timeout: 15000 });
    return response.data;
  } catch (error: any) {
    // Fallback endpoint: /suppliersearch
    try {
      const fbResponse = await axios.post(`${AIRIQ_BASE_URL}/suppliersearch`, searchBody, { headers, timeout: 15000 });
      return fbResponse.data;
    } catch (fbError: any) {
      console.warn('AirIQ Search failed on both endpoints:', error.response?.data?.message || error.message);
      throw error;
    }
  }
};

export interface AirIqPassengerInfo {
  title: string; // Mr. | Mrs. | Ms. | Mstr. | Miss
  first_name: string;
  last_name: string;
  dob: string; // YYYY/MM/DD
  passport_number: string;
  passport_expirydate: string; // YYYY/MM/DD
  passport_issuing_country_code: string;
  nationality: string;
}

export interface AirIqBookPayload {
  ticket_id: string;
  total_pax: number;
  adult: number;
  child: number;
  infant: number;
  adult_info: AirIqPassengerInfo[];
  child_info: AirIqPassengerInfo[];
  infant_info: AirIqPassengerInfo[];
}

/**
 * Books flight on AirIQ
 */
export const bookFlightAirIq = async (payload: AirIqBookPayload): Promise<any> => {
  const token = await authenticateAirIq();
  const headers = {
    'api-key': AIRIQ_API_KEY,
    'Authorization': token,
    'Content-Type': 'application/json'
  };

  try {
    // Primary endpoint: /book
    const response = await axios.post(`${AIRIQ_BASE_URL}/book`, payload, { headers, timeout: 25000 });
    return response.data;
  } catch (error: any) {
    // Fallback endpoint: /supplierbook
    try {
      const fbResponse = await axios.post(`${AIRIQ_BASE_URL}/supplierbook`, payload, { headers, timeout: 25000 });
      return fbResponse.data;
    } catch (fbError: any) {
      console.error('AirIQ Book Failed:', error.response?.data || error.message);
      throw error;
    }
  }
};

/**
 * Retrieves confirmed ticket from AirIQ by booking_id
 */
export const getTicketAirIq = async (bookingId: string): Promise<any> => {
  const token = await authenticateAirIq();
  const headers = {
    'api-key': AIRIQ_API_KEY,
    'Authorization': token,
    'Content-Type': 'application/json'
  };

  try {
    const response = await axios.get(`${AIRIQ_BASE_URL}/ticket?booking_id=${encodeURIComponent(bookingId)}`, { headers, timeout: 12000 });
    return response.data;
  } catch (error: any) {
    try {
      const fbResponse = await axios.get(`${AIRIQ_BASE_URL}/supplierticket?booking_id=${encodeURIComponent(bookingId)}`, { headers, timeout: 12000 });
      return fbResponse.data;
    } catch (fbError: any) {
      console.warn('AirIQ getTicket warning:', error.response?.data || error.message);
      return null;
    }
  }
};
