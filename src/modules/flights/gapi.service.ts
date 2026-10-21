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
    async (response) => {
      // GAPI sometimes returns 200 OK but with error payload inside JSON for expired tokens
      if (
        response.data && 
        (
          response.data.errorCode === 401 || 
          response.data.errorCode === 403 || 
          (response.data.error && (response.data.error.errorCode === 401 || response.data.error.errorCode === 403))
        )
      ) {
        console.log("GAPI Token Expired (Caught in Response Interceptor), Re-authenticating...");
        cachedTokenId = null;
        tokenExpiryDate = null;
        
        token = await authenticate();
        response.config.headers['Authorization'] = `Bearer ${token}`;
        return axios.request(response.config);
      }
      return response;
    },
    async (error) => {
      if (error.response && error.response.data && (error.response.data.errorCode === 401 || error.response.data.errorCode === 403)) {
        console.log("GAPI Token Expired (Caught in Error Interceptor), Re-authenticating...");
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
 * 1.5 Get Flight Sectors
 */
export const getSectors = async () => {
  const client = await getGapiClient();
  
  try {
    const response = await client.get('/search/sectors');
    return response.data;
  } catch (error: any) {
    console.error('GAPI getSectors error:', error?.response?.data || error.message);
    throw error;
  }
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

  const isReturn = Boolean(
    (searchRequest.query.tripType && searchRequest.query.tripType.toLowerCase().includes('round')) || 
    searchRequest.query.returnDate
  );
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
  
  let cabinClassVal = "1";
  if (isReturn && (destIata === 'DXB' || originIata === 'DXB')) cabinClassVal = "2";
  else if (searchRequest.query.cabinClass === 'Business') cabinClassVal = "3";
  else if (searchRequest.query.cabinClass === 'First') cabinClassVal = "4";
  else if (searchRequest.query.cabinClass === 'Premium Economy') cabinClassVal = "2";
  else if (['1', '2', '3', '4'].includes(String(searchRequest.query.cabinClass))) cabinClassVal = String(searchRequest.query.cabinClass);

  // Onward segment
  segments.push({
    origin: originIata,
    destination: destIata,
    flightCabinClass: cabinClassVal,
    preferredDepartureTime: `${onwardDate}T00:00:00`
  });

  if (isReturn) {
    segments.push({
      origin: destIata,
      destination: originIata,
      flightCabinClass: cabinClassVal, 
      preferredDepartureTime: `${returnDate}T00:00:00`
    });
  }

  const indianAirports = new Set(['DEL','BOM','NMI','BLR','MAA','CCU','HYD','AMD','PNQ','GOI','GOX','COK','TRV','CCJ','JAI','ATQ','LKO','BBI','PAT','GAU','IXB','IXZ','IXC','SXR','VNS','BHO','IDR','NAG','RPR','BDQ','STV']);
  const isIntl = !indianAirports.has(originIata) || !indianAirports.has(destIata);

  const payload = {
    onwarddate: onwardDate,
    returndate: returnDate,
    resultCategory: isReturn ? "2" : "1",
    prefclass: cabinClassVal,
    segments,
    adultCount: searchRequest.query.adults || 1,
    childCount: searchRequest.query.children || 0,
    infantCount: searchRequest.query.infants || 0,
    endUserIp: "1.1.1.1",
    journeyType: isReturn ? "2" : "1",
    sources: ["ANY"],
    domIntFlag: isIntl ? "I" : "D"
  };

  try {
    let response = await client.post('/search/flights', payload);
    
    if (response.data.responseStatus !== 1 || !response.data.results || response.data.results.length === 0) {
      // Retry with alternate cabin class (1 vs 2)
      const altCabin = payload.prefclass === "1" ? "2" : "1";
      const altPayload = {
        ...payload,
        prefclass: altCabin,
        segments: payload.segments.map(s => ({ ...s, flightCabinClass: altCabin }))
      };
      const altResponse = await client.post('/search/flights', altPayload);
      if (altResponse.data.responseStatus === 1 && altResponse.data.results?.length > 0) {
        response = altResponse;
      }
    }

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
 * 3. Fare Quote
 * @param resultSessionId The resultSessionId from the search response
 */
export const fareQuote = async (resultSessionId: string) => {
  const client = await getGapiClient();
  
  try {
    const payload = { resultSessionId: [resultSessionId] };
    console.log("============= GAPI FARE QUOTE REQUEST =============");
    console.log(JSON.stringify(payload, null, 2));

    const response = await client.post('/search/fareQuote', payload);
    
    console.log("============= GAPI FARE QUOTE RESPONSE =============");
    console.log(JSON.stringify(response.data, null, 2));
    
    if (response.data.responseStatus !== 1) {
      console.warn("GAPI FareQuote returned non-success status", response.data.error || response.data);
      return { success: false, error_msg: response.data.error?.errorMessage || "Fare Quote failed" };
    }

    return { success: true, _data: response.data };
  } catch (error: any) {
    console.error('GAPI fareQuote error:', error?.response?.data || error.message);
    throw error;
  }
};

/**
 * 4. Book Flight
 */
export const bookFlight = async (
  resultSessionId: string,
  paxes: any[],
  client_details: any,
  agent_reference: string
) => {
  const client = await getGapiClient();
  
  // Map passengers
  const passengers = paxes.map((p, index) => {
    let paxType = 1;
    const pTypeStr = String(p.type || p.passengerType || '').toLowerCase();
    if (pTypeStr.includes('child') || p.paxType === 2) paxType = 2;
    if (pTypeStr.includes('infant') || p.paxType === 3) paxType = 3;

    let gender = 1; // Male
    if (['Mrs', 'Ms', 'Miss'].includes(p.title) || p.gender === 2 || String(p.gender).toLowerCase() === 'female') gender = 2;

    const fullName = p.name || '';
    const nameParts = fullName.split(' ');
    const firstName = p.first_name || p.firstName || nameParts[0] || 'Unknown';
    const lastName = p.last_name || p.lastName || nameParts.slice(1).join(' ') || 'User';

    return {
      paxType,
      title: p.title || (gender === 2 ? 'Mrs' : 'Mr'),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      addressLine1: p.addressLine1 || "Delhi",
      city: p.city || "Delhi",
      countryCode: p.countryCode || "IN",
      nationality: p.nationality || "IN",
      postalCode: p.postalCode || "110092",
      dateOfBirth: p.dob || p.dateOfBirth || "",
      passportNo: p.passport_num || p.passportNum || p.passportNo || "",
      passportExpiry: p.passport_expiry_date || p.passportExpiry || "",
      passportIssueDate: p.passportIssueDate || "",
      gender,
      isLeadPax: index === 0
    };
  });

  try {
    const payload = {
      resultSessionId,
      gSTDetailsRequired: false,
      contactNo: client_details.phone || "9999999999",
      email: client_details.email || "test@test.com",
      passengers
    };

    console.log("============= GAPI FLIGHT BOOKING REQUEST =============");
    console.log(JSON.stringify(payload, null, 2));

    const response = await client.post('/flightbooking/flight-booking', payload);
    
    console.log("============= GAPI FLIGHT BOOKING RESPONSE =============");
    console.log(JSON.stringify(response.data, null, 2));
    
    if (response.data.status !== 1) {
      console.warn("GAPI Booking returned non-success status", response.data);
      return { success: false, error_msg: response.data.errorMsg || "Booking failed" };
    }

    return { 
      success: true, 
      response_ref: response.data.txid,
      bookingstatus: response.data.bookingstatus
    };
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
