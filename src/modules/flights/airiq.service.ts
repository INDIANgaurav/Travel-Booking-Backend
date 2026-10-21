import axios from 'axios';

const AIRIQ_BASE_URL = process.env.AIRIQ_BASE_URL || 'https://omairiq.azurewebsites.net';
const AIRIQ_API_KEY = process.env.AIRIQ_API_KEY || 'NTMzNDUwMDpBSVJJUSBURVNUIEFQSToxODkxOTMwMDM1OTk2OlBvTjE2NGNkLy9heE53WC9hM00rS1ZrcnJSa2Q0S05adHl3Q0NHZmU4Uzg9';
const AIRIQ_USERNAME = process.env.AIRIQ_USERNAME || '9555202202';
const AIRIQ_PASSWORD = process.env.AIRIQ_PASSWORD || '112233344';

// Store token in memory
let cachedToken: string = '';
let tokenExpiry: number = 0;

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
        }
      }
    );

    if (response.data && response.data.token) {
      cachedToken = response.data.token;
      // Expiration in seconds or fallback to 55 minutes
      const expiresInSec = response.data.expiration || 3599;
      tokenExpiry = Date.now() + ((expiresInSec - 60) * 1000); 
      return cachedToken;
    }
    throw new Error('No token found in response');
  } catch (error: any) {
    console.error('AirIQ Authentication Failed:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with AirIQ');
  }
};

export const searchFlightsAirIq = async (payload: any) => {
  const token = await authenticateAirIq();
  try {
    const response = await axios.post(
      `${AIRIQ_BASE_URL}/suppliersearch`,
      payload,
      {
        headers: {
          'api-key': AIRIQ_API_KEY,
          'Authorization': token,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('AirIQ Search Failed:', error.response?.data || error.message);
    throw error;
  }
};

export const bookFlightAirIq = async (payload: any) => {
  const token = await authenticateAirIq();
  try {
    const response = await axios.post(
      `${AIRIQ_BASE_URL}/supplierbook`,
      payload,
      {
        headers: {
          'api-key': AIRIQ_API_KEY,
          'Authorization': token,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('AirIQ Book Failed:', error.response?.data || error.message);
    throw error;
  }
};
