import axios from 'axios';

const NEXUSDMC_API_DOMAIN = process.env.NEXUSDMC_API_DOMAIN || 'https://krn.nexusdmc.com';
const NEXUSDMC_API_KEY = process.env.NEXUSDMC_API_KEY || 'test_f7777e456d5fa518add3772036c4afa357db9cb6fe96a80d';

const nexusApi = axios.create({
  baseURL: NEXUSDMC_API_DOMAIN,
  headers: {
    'Content-Type': 'application/json',
    'api-key': NEXUSDMC_API_KEY,
  },
});

export const getAvailableSectors = async (operatingDays: boolean = false) => {
  try {
    const response = await nexusApi.get('/api/v1/flights/series-sectors', {
      params: operatingDays ? { operatingDays: true } : {},
    });
    return response.data;
  } catch (error) {
    console.error('NexusDMC getAvailableSectors error:', error);
    throw error;
  }
};

export const getAvailableDates = async (origin: string, destination: string) => {
  try {
    const response = await nexusApi.get('/api/v1/flights/series-dates', {
      params: { origin, destination },
    });
    return response.data;
  } catch (error) {
    console.error('NexusDMC getAvailableDates error:', error);
    throw error;
  }
};

export const searchFlightsNexus = async (segment: string, pax: string) => {
  try {
    const response = await nexusApi.get('/api/v1/flights/series-search', {
      params: { segment, pax },
    });
    return response.data;
  } catch (error) {
    console.error('NexusDMC searchFlights error:', error);
    throw error;
  }
};

export const checkAvailability = async (query: any, flight_keys: string[], total_price: number, currency: string) => {
  try {
    const response = await nexusApi.post('/api/v1/flights/series-check-avail', {
      query,
      flight_keys,
      total_price,
      currency,
    });
    return response.data;
  } catch (error) {
    console.error('NexusDMC checkAvailability error:', error);
    throw error;
  }
};

export const bookFlight = async (
  query: any,
  flight_keys: string[],
  total_price: number,
  currency: string,
  paxes: any[],
  client_details: { email: string; phone: string },
  agent_reference: string
) => {
  try {
    const response = await nexusApi.post('/api/v1/flights/series-book', {
      query,
      flight_keys,
      total_price,
      currency,
      paxes,
      client_details,
      agent_reference,
    });
    return response.data;
  } catch (error) {
    console.error('NexusDMC bookFlight error:', error);
    throw error;
  }
};

export const fetchBookingDetails = async (bookingReference: string) => {
  try {
    const response = await nexusApi.get(`/api/v1/bookings/reference/${bookingReference}`);
    return response.data;
  } catch (error) {
    console.error('NexusDMC fetchBookingDetails error:', error);
    throw error;
  }
};
