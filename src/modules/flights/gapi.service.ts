import axios from 'axios';
import Supplier from '../supplier/supplier.model';
 let cachedTokenId: string | null = null;
let tokenExpiryDate: Date | null = null;

 
const isTokenValid = () => {
  if (!cachedTokenId || !tokenExpiryDate) return false;
  const now = new Date();
  return now < tokenExpiryDate;
};

 
const getMidnight = () => {
  const tomorrow = new Date();
  tomorrow.setHours(23, 59, 59, 999);  
  return tomorrow;
};

 
export const getGapiConfig = async () => {
 
  const supplier = await Supplier.findOne({ name: 'GAPI INFOTECH' });
  
  let baseUrl = process.env.GAPI_BASE_URL || '';
  let username = process.env.GAPI_USERNAME || '';
  let password = process.env.GAPI_PASSWORD || '';
  let authChannel = process.env.GAPI_AUTH_CHANNEL || '';
  let basicAuth = process.env.GAPI_BASIC_AUTH || '';

  if (supplier && supplier.credentials && supplier.credentials.length > 0) {
    const findCred = (key: string) => supplier.credentials.find(c => c.key === key)?.value;
    
    if (findCred('GAPI_BASE_URL')) baseUrl = findCred('GAPI_BASE_URL')!;
    if (findCred('GAPI_USERNAME')) username = findCred('GAPI_USERNAME')!;
    if (findCred('GAPI_PASSWORD')) password = findCred('GAPI_PASSWORD')!;
    if (findCred('GAPI_AUTH_CHANNEL')) authChannel = findCred('GAPI_AUTH_CHANNEL')!;
    if (findCred('GAPI_BASIC_AUTH')) basicAuth = findCred('GAPI_BASIC_AUTH')!;
  }

  return { baseUrl, username, password, authChannel, basicAuth };
};

 
export const authenticate = async (): Promise<string> => {
  if (isTokenValid()) {
    return cachedTokenId!;
  }

  const { baseUrl, username, password, authChannel, basicAuth } = await getGapiConfig();

  try {
    const response = await axios.post(
      `${baseUrl}/oauth2/tokens`,
      {
        username,
        password,
        auth_channel: authChannel
      },
      {
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json'
        }
      }
    );

     if (response.data && response.data.errorCode) {
       throw new Error(`GAPI Auth Failed: ${response.data.errorMessage}`);
    }

    if (response.data && response.data.tokenId) {
      cachedTokenId = response.data.tokenId;
      tokenExpiryDate = getMidnight();
      return cachedTokenId!;
    } else {
      throw new Error(`GAPI Auth Failed: ${JSON.stringify(response.data)}`);
    }
  } catch (error: any) {
    console.error('GAPI Authenticate Error:', error?.response?.data || error.message);
    throw new Error('Failed to authenticate with GAPI');
  }
};

 const getGapiClient = async () => {
  const { baseUrl } = await getGapiConfig();
  let token = await authenticate();

  const client = axios.create({
    baseURL: baseUrl,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });

   client.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response && error.response.data && error.response.data.errorCode === 401) {
         cachedTokenId = null;
        tokenExpiryDate = null;
        
        token = await authenticate();
        error.config.headers['Authorization'] = `Bearer ${token}`;
        return axios.request(error.config);
      }
      return Promise.reject(error);
    }
  );

  return client;
};

/**
 * 2. Search Flights
 * @param searchRequest Standardized search request 
 */
export const searchFlights = async (searchRequest: any) => {
  const client = await getGapiClient();
  
  // Format dates: YYYY-MM-DD
  const formatGapiDate = (d: string) => {
    const date = new Date(d);
    return date.toISOString().split('T')[0];
  };

  const isReturn = searchRequest.query.tripType === 'round-trip';
  const onwardDate = formatGapiDate(searchRequest.query.date);
  const returnDate = isReturn && searchRequest.query.returnDate ? formatGapiDate(searchRequest.query.returnDate) : "";
  
  // Convert New Delhi (DEL) to DEL
  const getIataCode = (cityName: string): string => {
    if (!cityName) return '';
    const match = cityName.match(/\(([A-Z]{3})\)/i);
    return match ? match[1].toUpperCase() : cityName.substring(0, 3).toUpperCase();
  };

  const originIata = getIataCode(searchRequest.query.from);
  const destIata = getIataCode(searchRequest.query.to);

  // Construct segments array for GAPI
  const segments = [];
  
  // Onward segment
  segments.push({
    origin: originIata,
    destination: destIata,
    flightCabinClass: "1", // 1 is Economy in prod
    preferredDepartureTime: `${onwardDate}T00:00:00`
  });

  if (isReturn) {
    segments.push({
      origin: destIata,
      destination: originIata,
      flightCabinClass: "1", 
      preferredDepartureTime: `${returnDate}T00:00:00`
    });
  }

  const payload = {
    onwarddate: onwardDate,
    returndate: returnDate,
    resultCategory: "1",
    prefclass: "1",
    segments,
    adultCount: searchRequest.query.adults || 1,
    childCount: searchRequest.query.children || 0,
    infantCount: searchRequest.query.infants || 0,
    endUserIp: "1.1.1.1",
    journeyType: isReturn ? "2" : "1",
    sources: ["ANY"],
    domIntFlag: "D" // Will need dynamic detection based on origin/dest in production, defaulting to D for now
  };

  try {
    const response = await client.post('/search/flights', payload);
    
    // According to docs, responseStatus 1 means success
    if (response.data.responseStatus !== 1) {
      console.warn("GAPI Search returned non-success status", response.data.error);
      return [];
    }

    return response.data.results || [];
  } catch (error: any) {
    console.error('GAPI searchFlights error:', error?.response?.data || error.message);
    throw error;
  }
};

/**
 * 3. Fare Quote / Rules
 */
export const fareQuote = async (resultSessionId: string) => {
  const client = await getGapiClient();
  
  try {
    const response = await client.post('/search/fareQuote', {
      resultSessionId: [resultSessionId]
    });

    if (response.data.responseStatus !== 1) {
      throw new Error(`GAPI FareQuote failed: ${response.data.error?.errorMessage || 'Unknown error'}`);
    }

    return response.data.results;
  } catch (error: any) {
    console.error('GAPI fareQuote error:', error?.response?.data || error.message);
    throw error;
  }
};

/**
 * 4. Book Flight
 */
export const bookFlight = async (bookingPayload: any) => {
  const client = await getGapiClient();
  
  try {
    const response = await client.post('/flightbooking/flight-booking', bookingPayload);

    // bookingstatus == "Confirmed" and status == 1 means success
    if (response.data.status !== 1 || response.data.bookingstatus !== "Confirmed") {
      throw new Error(`GAPI Booking failed: ${response.data.errorMsg || 'Unknown error'}`);
    }

    return response.data;
  } catch (error: any) {
    console.error('GAPI bookFlight error:', error?.response?.data || error.message);
    throw error;
  }
};

/**
 * 5. Get Booking Details (to fetch PNR)
 */
export const getBookingDetails = async (txid: string) => {
  const client = await getGapiClient();
  
  try {
    const response = await client.get(`/search/${txid}`);

    if (response.data.status !== 1 || response.data.bookingstatus !== "Confirmed") {
      throw new Error('GAPI Get Booking Details failed or status is not confirmed');
    }

    return response.data;
  } catch (error: any) {
    console.error('GAPI getBookingDetails error:', error?.response?.data || error.message);
    throw error;
  }
};
