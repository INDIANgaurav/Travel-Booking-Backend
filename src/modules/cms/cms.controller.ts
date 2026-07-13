import { Request, Response } from 'express';
import Offer from './offer.model';
import Destination from '../tours/destination.model';

 
export const getCMSDestinations = async (req: Request, res: Response) => {
  try {
    const destinations = await Destination.find({ isActive: true }).limit(6);
    
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
    const offers = await Offer.find({ isActive: true }).limit(5);

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
