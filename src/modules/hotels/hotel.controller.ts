import { Request, Response } from 'express';
import Hotel from './hotel.model';
import { AuthRequest } from '../../middleware/auth.middleware';

// 1. Register a new Hotel (Partner/User)
export const registerHotel = async (req: AuthRequest, res: Response) => {
  try {
    const { name, city, state, address, description, pricePerNight, amenities } = req.body;
    
    // Process uploaded images
    const images = req.files ? (req.files as Express.Multer.File[]).map(file => file.path) : [];

    const newHotel = new Hotel({
      name,
      city,
      state,
      address,
      description,
      pricePerNight: Number(pricePerNight),
      amenities: typeof amenities === 'string' ? JSON.parse(amenities) : amenities,
      images,
      ownerId: req.user?._id
    });

    await newHotel.save();
    return res.status(201).json({ message: "Hotel registered successfully", hotel: newHotel });
  } catch (error) {
    console.error("Error registering hotel:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// 2. Hybrid Hotel Search
export const searchHotels = async (req: Request, res: Response) => {
  try {
    const { city, checkIn, checkOut, adults } = req.query;
    
    if (!city) {
      return res.status(400).json({ message: "City is required" });
    }

    const searchCity = (city as string).trim();

    const localHotels = await Hotel.find({
      status: 'APPROVED',
      $or: [
        { city: { $regex: new RegExp(searchCity, 'i') } },
        { state: { $regex: new RegExp(searchCity, 'i') } }
      ]
    }).lean();

    // B. Fetch from External API (Mocking Duffel Stays / RapidAPI for now)
    const externalHotels = [
      {
        _id: `ext_${Math.random().toString(36).substring(7)}`,
        name: `The Grand ${searchCity} Plaza (API)`,
        city: searchCity,
        address: `123 Main St, ${searchCity}`,
        description: "A beautiful luxury stay provided by our global partners.",
        pricePerNight: Math.floor(Math.random() * 5000) + 4000,
        images: ["https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80"],
        amenities: ["Free WiFi", "Pool", "Spa"],
        rating: 4.5,
        source: "external"
      },
      {
        _id: `ext_${Math.random().toString(36).substring(7)}`,
        name: `Budget Inn ${searchCity} (API)`,
        city: searchCity,
        address: `456 Station Rd, ${searchCity}`,
        description: "Affordable and clean rooms near the city center.",
        pricePerNight: Math.floor(Math.random() * 2000) + 1500,
        images: ["https://images.unsplash.com/photo-1522798514-97ceb8c4f1c8?auto=format&fit=crop&w=800&q=80"],
        amenities: ["Free WiFi", "AC", "Breakfast"],
        rating: 3.8,
        source: "external"
      }
    ];

    // C. Aggregate and Sort
    const aggregatedResults = [...localHotels, ...externalHotels].sort((a: any, b: any) => a.pricePerNight - b.pricePerNight);

    return res.status(200).json(aggregatedResults);
  } catch (error) {
    console.error("Error searching hotels:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// 3. Get My Properties (For Partner Dashboard)
export const getMyProperties = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const properties = await Hotel.find({ ownerId: userId }).sort({ createdAt: -1 });
    return res.status(200).json(properties);
  } catch (error) {
    console.error("Error fetching user properties:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// 4. Update My Property
export const updateMyProperty = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;
    const updateData = req.body;

    const property = await Hotel.findOneAndUpdate(
      { _id: id, ownerId: userId },
      updateData,
      { new: true }
    );

    if (!property) return res.status(404).json({ message: "Property not found or unauthorized" });
    return res.status(200).json(property);
  } catch (error) {
    console.error("Error updating property:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// 5. Delete My Property
export const deleteMyProperty = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;

    const property = await Hotel.findOneAndDelete({ _id: id, ownerId: userId });
    if (!property) return res.status(404).json({ message: "Property not found or unauthorized" });

    return res.status(200).json({ message: "Property deleted successfully" });
  } catch (error) {
    console.error("Error deleting property:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// 6. Get All Properties (For Admin/SubAdmin)
export const getAllProperties = async (req: Request, res: Response) => {
  try {
    const properties = await Hotel.find().populate('ownerId', 'name email').sort({ createdAt: -1 });
    return res.status(200).json(properties);
  } catch (error) {
    console.error("Error fetching all properties:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// 7. Update Property Status (For Admin/SubAdmin)
export const updatePropertyStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const property = await Hotel.findByIdAndUpdate(id, { status }, { new: true });
    if (!property) return res.status(404).json({ message: "Property not found" });

    return res.status(200).json(property);
  } catch (error) {
    console.error("Error updating property status:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// 8. Delete Any Property (For Admin/SubAdmin)
export const deletePropertyAdmin = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const property = await Hotel.findByIdAndDelete(id);
    if (!property) return res.status(404).json({ message: "Property not found" });

    return res.status(200).json({ message: "Property deleted successfully" });
  } catch (error) {
    console.error("Error deleting property (Admin):", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
