import { Request, Response } from 'express';
import PromoCode from './promo.model';
import { AuthRequest } from '../../middleware/auth.middleware';
import Booking from '../bookings/booking.model';
import SeriesFare from '../seriesFare/seriesFare.model';

// @desc    Create a new promo code
// @route   POST /api/promos
// @access  Private (Admin/SubAdmin)
export const createPromoCode = async (req: AuthRequest, res: Response) => {
  try {
    const isSupplier = req.user?.roles?.some((r: string) => ['SUPPLIER_AGENT', 'SUPPLIER_STAFF'].includes(r));
    const isAdmin = req.user?.roles?.some((r: string) => ['SUPER_ADMIN', 'SUB_ADMIN'].includes(r));
    
    if (isSupplier && !isAdmin) {
      if (!req.body.conditions) req.body.conditions = {};
      req.body.conditions.supplierId = req.user?._id;
    }
    
    const newPromo = new PromoCode(req.body);
    const savedPromo = await newPromo.save();
    res.status(201).json({ message: 'Promo code created successfully', promo: savedPromo });
  } catch (error: any) {
    if (error.code === 11000) return res.status(400).json({ message: 'Promo code already exists' });
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all promo codes
// @route   GET /api/promos
// @access  Private (Admin/SubAdmin)
export const getAllPromoCodes = async (req: AuthRequest, res: Response) => {
  try {
    const isSupplier = req.user?.roles?.some((r: string) => ['SUPPLIER_AGENT', 'SUPPLIER_STAFF'].includes(r));
    const isAdmin = req.user?.roles?.some((r: string) => ['SUPER_ADMIN', 'SUB_ADMIN'].includes(r));
    
    let filter = {};
    if (isSupplier && !isAdmin) {
      filter = { 'conditions.supplierId': req.user?._id };
    }
    
    const promos = await PromoCode.find(filter)
      .populate('conditions.supplierId', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // Fetch flight details for promos with PNR
    const populatedPromos = await Promise.all(promos.map(async (promo: any) => {
      if (promo.conditions?.pnr) {
        const flight = await SeriesFare.findOne({ 
          airlinePnr: { $regex: new RegExp(`^${promo.conditions.pnr}$`, 'i') } 
        }).select('origin destination departureTime arrivalTime travelDate flightNo airline supplierId').lean();
        if (flight) {
          promo.flightDetails = flight;
        }
      }
      return promo;
    }));

    res.status(200).json(populatedPromos);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get flight details for a specific promo (for admin eye modal)
// @route   GET /api/promos/:id/flight-details
// @access  Private (Admin/SubAdmin/Supplier)
export const getPromoFlightDetails = async (req: AuthRequest, res: Response) => {
  try {
    const promo = await PromoCode.findById(req.params.id).lean() as any;
    if (!promo) return res.status(404).json({ message: 'Promo not found' });

    // Fetch linked SeriesFare flight (case-insensitive PNR match)
    if (promo.conditions?.pnr) {
      const flight = await SeriesFare.findOne({
        airlinePnr: { $regex: new RegExp(`^${promo.conditions.pnr}$`, 'i') }
      }).select('origin destination departureTime arrivalTime travelDate flightNo airline supplierId').lean();
      if (flight) (promo as any).flightDetails = flight;
    }

    // Fetch linked bookings that used this promo code
    const linkedBookings = await Booking.find({ promoCodeApplied: promo.code })
      .populate('user', 'name email')
      .select('bookingId user discountAmount totalAmount createdAt status')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    (promo as any).linkedBookings = linkedBookings;

    res.status(200).json(promo);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a promo code
// @route   PUT /api/promos/:id
// @access  Private (Admin/SubAdmin)
export const updatePromoCode = async (req: AuthRequest, res: Response) => {
  try {
    const promo = await PromoCode.findById(req.params.id);
    if (!promo) return res.status(404).json({ message: 'Promo code not found' });

    const isSupplier = req.user?.roles?.some((r: string) => ['SUPPLIER_AGENT', 'SUPPLIER_STAFF'].includes(r));
    const isAdmin = req.user?.roles?.some((r: string) => ['SUPER_ADMIN', 'SUB_ADMIN'].includes(r));
    
    if (isSupplier && !isAdmin) {
      if (promo.conditions?.supplierId?.toString() !== req.user?._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to update this promo code' });
      }
      if (req.body.conditions) {
        req.body.conditions.supplierId = req.user?._id;
      }
    }

    const updatedPromo = await PromoCode.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.status(200).json({ message: 'Promo code updated successfully', promo: updatedPromo });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a promo code
// @route   DELETE /api/promos/:id
// @access  Private (Admin/SubAdmin)
export const deletePromoCode = async (req: AuthRequest, res: Response) => {
  try {
    const promo = await PromoCode.findById(req.params.id);
    if (!promo) return res.status(404).json({ message: 'Promo code not found' });

    const isSupplier = req.user?.roles?.some((r: string) => ['SUPPLIER_AGENT', 'SUPPLIER_STAFF'].includes(r));
    const isAdmin = req.user?.roles?.some((r: string) => ['SUPER_ADMIN', 'SUB_ADMIN'].includes(r));

    if (isSupplier && !isAdmin) {
      if (promo.conditions?.supplierId?.toString() !== req.user?._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to delete this promo code' });
      }
    }

    await PromoCode.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Promo code deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Validate a promo code for checkout
// @route   POST /api/promos/validate
// @access  Private (B2B Agent)
export const validatePromoCode = async (req: AuthRequest, res: Response) => {
  try {
    const { code, module, flightDetails } = req.body;
    
    if (!code) return res.status(400).json({ message: 'Promo code is required' });

    const promo = await PromoCode.findOne({ code: code.toUpperCase(), isActive: true });
    if (!promo) return res.status(404).json({ message: 'Invalid or inactive promo code' });

    const now = new Date();
    if (now < promo.validFrom || now > promo.validTo) {
      return res.status(400).json({ message: 'Promo code is expired or not yet valid' });
    }

    if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) {
      return res.status(400).json({ message: 'Promo code usage limit reached' });
    }

    if (!promo.applicableModules.includes(module) && !promo.applicableModules.includes('ALL')) {
      return res.status(400).json({ message: `Promo code is not valid for ${module} bookings` });
    }

    // Check user limit
    if (promo.usageLimitPerUser > 0 && req.user?._id) {
      const pastUsage = await Booking.countDocuments({ agentId: req.user._id, promoCodeApplied: promo.code });
      if (pastUsage >= promo.usageLimitPerUser) {
        return res.status(400).json({ message: 'You have exceeded the usage limit for this promo code' });
      }
    }

    // Check strict conditions (Flight Specific)
    if (module === 'FLIGHT' && promo.conditions && flightDetails) {
      if (promo.conditions.origin && flightDetails.origin?.toUpperCase() !== promo.conditions.origin.toUpperCase()) {
        return res.status(400).json({ message: `Promo code is only valid for flights departing from ${promo.conditions.origin}` });
      }
      if (promo.conditions.destination && flightDetails.destination?.toUpperCase() !== promo.conditions.destination.toUpperCase()) {
        return res.status(400).json({ message: `Promo code is only valid for flights arriving at ${promo.conditions.destination}` });
      }
      if (promo.conditions.flightNumber && flightDetails.flightNumber !== promo.conditions.flightNumber) {
        return res.status(400).json({ message: `Promo code is only valid for flight ${promo.conditions.flightNumber}` });
      }
      if (promo.conditions.pnr && flightDetails.pnr?.toUpperCase() !== promo.conditions.pnr.toUpperCase()) {
        return res.status(400).json({ message: `Promo code is only valid for PNR ${promo.conditions.pnr}` });
      }
      // Date matching can be complex due to timezones, simple matching for now
      if (promo.conditions.travelDate && flightDetails.travelDate) {
        const pDate = new Date(promo.conditions.travelDate).toISOString().split('T')[0];
        const fDate = new Date(flightDetails.travelDate).toISOString().split('T')[0];
        if (pDate !== fDate) {
          return res.status(400).json({ message: 'Promo code is not valid for this travel date' });
        }
      }
    }

    res.status(200).json({ 
      message: 'Promo code applied successfully', 
      discountAmount: promo.discountAmount,
      discountType: promo.discountType,
      promo
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get available promos for checkout
// @route   GET /api/promos/available
// @access  Private
export const getAvailablePromos = async (req: AuthRequest, res: Response) => {
  try {
    const { pnr, supplierId, module = 'FLIGHT' } = req.query;
    const now = new Date();

    let query: any = {
      isActive: true,
      validFrom: { $lte: now },
      validTo: { $gte: now },
      applicableModules: module
    };

    const promos = await PromoCode.find(query);

    // Filter logic:
    // 1. If promo has a specific supplierId, it MUST match the requested supplierId. If it has no supplierId, it's a global admin promo (always valid if other conditions met).
    // 2. If promo has a specific PNR, it MUST match the requested PNR. If no PNR, it applies to all flights for that supplier/global.
    const applicablePromos = promos.filter(promo => {
      // Check max uses limit globally
      if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) return false;

      // Check PNR constraints first
      let pnrMatched = false;
      if (promo.conditions?.pnr) {
        if (!pnr || promo.conditions.pnr.toUpperCase() !== pnr.toString().toUpperCase()) {
          return false;
        }
        pnrMatched = true;
      }

      // Check supplier constraints (skip if PNR already perfectly matched and validated)
      if (promo.conditions?.supplierId && !pnrMatched) {
        if (!supplierId || promo.conditions.supplierId.toString() !== supplierId.toString()) {
          return false;
        }
      }

      return true;
    });

    res.status(200).json(applicablePromos);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
