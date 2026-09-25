import { Request, Response } from 'express';
import Offer from './offer.model';
import Destination from '../tours/destination.model';
import Booking from '../bookings/booking.model';

// City name → [lat, lng] mapping for known IATA-city names
const CITY_COORDS: Record<string, [number, number]> = {
  'DEL': [28.6139, 77.2090], 'BOM': [19.0760, 72.8777], 'BLR': [12.9716, 77.5946],
  'GOI': [15.2993, 74.1240], 'CCU': [22.5726, 88.3639], 'HYD': [17.3850, 78.4867],
  'MAA': [13.0827, 80.2707], 'DXB': [25.2048, 55.2708], 'BKK': [13.7563, 100.5018],
  'LHR': [51.5074, -0.1278], 'NRT': [35.6762, 139.6503], 'JFK': [40.7128, -74.0060],
  'MLE': [3.2028, 73.2207], 'SIN': [1.3521, 103.8198], 'CDG': [48.8566, 2.3522],
  'SYD': [-33.8688, 151.2093], 'AUH': [24.4539, 54.3773],
  'New Delhi': [28.6139, 77.2090], 'Mumbai': [19.0760, 72.8777], 'Bengaluru': [12.9716, 77.5946],
  'Goa': [15.2993, 74.1240], 'Kolkata': [22.5726, 88.3639], 'Hyderabad': [17.3850, 78.4867],
  'Chennai': [13.0827, 80.2707], 'Dubai': [25.2048, 55.2708], 'Bangkok': [13.7563, 100.5018],
  'London': [51.5074, -0.1278], 'Tokyo': [35.6762, 139.6503], 'New York': [40.7128, -74.0060],
  'Maldives': [3.2028, 73.2207], 'Singapore': [1.3521, 103.8198], 'Paris': [48.8566, 2.3522],
  'Sydney': [-33.8688, 151.2093], 'Abu Dhabi': [24.4539, 54.3773],
};

// Fallback popular destinations if no bookings yet
const FALLBACK_MARKERS = [
  { city: 'New Delhi', lat: 28.6139, lng: 77.2090, count: 1 },
  { city: 'Dubai', lat: 25.2048, lng: 55.2708, count: 1 },
  { city: 'Goa', lat: 15.2993, lng: 74.1240, count: 1 },
  { city: 'Maldives', lat: 3.2028, lng: 73.2207, count: 1 },
  { city: 'London', lat: 51.5074, lng: -0.1278, count: 1 },
  { city: 'Bangkok', lat: 13.7563, lng: 100.5018, count: 1 },
  { city: 'Singapore', lat: 1.3521, lng: 103.8198, count: 1 },
  { city: 'Mumbai', lat: 19.0760, lng: 72.8777, count: 1 },
];

export const getGlobeStats = async (req: Request, res: Response) => {
  try {
    const bookings = await Booking.find(
      { status: 'CONFIRMED', 'details.to': { $exists: true, $ne: '' } },
      'details.to'
    ).lean();

    if (!bookings || bookings.length === 0) {
      return res.json(FALLBACK_MARKERS);
    }

    // Aggregate by destination
    const countMap: Record<string, number> = {};
    bookings.forEach((b: any) => {
      const dest = b.details?.to;
      if (dest) countMap[dest] = (countMap[dest] || 0) + 1;
    });

    // Map to coordinates
    const markers = Object.entries(countMap)
      .map(([city, count]) => {
        const coords = CITY_COORDS[city];
        if (!coords) return null;
        return { city, lat: coords[0], lng: coords[1], count };
      })
      .filter(Boolean);

    // If none matched coordinates, return fallback
    if (markers.length === 0) return res.json(FALLBACK_MARKERS);

    res.json(markers);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};



 
export const getCMSDestinations = async (req: Request, res: Response) => {
  try {
    const destinations = await Destination.find({ isActive: true }).limit(6).lean();
    
    // Mapping to match the UI spec requested
    const formattedDestinations = destinations.map(d => ({
      name: d.name,
      price: 3999, // Dummy price as per UI spec placeholder
      imgUrl: d.imageUrl || "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?q=80&w=2000"
    }));

    res.json(formattedDestinations);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

 
export const getOffers = async (req: Request, res: Response) => {
  try {
    const offers = await Offer.find({ isActive: true }).limit(5).lean();

    // If empty, return a dummy one to satisfy UI spec
    if (offers.length === 0) {
      return res.json([
        {
          title: "Flight Offer",
          description: "Up to 12% OFF on Domestic Flights",
          code: "FLY12",
          type: "FLIGHT"
        }
      ]);
    }

    res.json(offers);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
