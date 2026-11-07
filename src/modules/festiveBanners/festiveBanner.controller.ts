import { Request, Response } from 'express';
import FestiveBanner from './festiveBanner.model';

// @desc    Get currently active festive banner(s) for the client / landing page
// @route   GET /api/festive-banners/active
// @access  Public
export const getActiveBanners = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    
    // Find active banners that are either within date range or have no date bounds
    const banners = await FestiveBanner.find({
      isActive: true,
      $and: [
        { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }] }
      ]
    })
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    res.json(banners);
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to fetch active festive banners' });
  }
};

// @desc    Get all festive banners (for Admin Management)
// @route   GET /api/festive-banners
// @access  Admin only
export const getAllBanners = async (req: Request, res: Response) => {
  try {
    const banners = await FestiveBanner.find({})
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    res.json(banners);
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to fetch festive banners' });
  }
};

// @desc    Create a new festive banner
// @route   POST /api/festive-banners
// @access  Admin only
export const createBanner = async (req: Request, res: Response) => {
  try {
    const {
      title,
      subtitle,
      bannerType,
      festival,
      badgeText,
      promoCode,
      discountText,
      ctaText,
      ctaLink,
      imageUrl,
      bgTheme,
      customBgGradient,
      isActive,
      showTopStrip,
      startDate,
      endDate,
      priority
    } = req.body;

    if (!title || !subtitle) {
      return res.status(400).json({ message: 'Title and Subtitle/Greeting message are required' });
    }

    const banner = await FestiveBanner.create({
      title: title.trim(),
      subtitle: subtitle.trim(),
      bannerType: bannerType || 'GREETING',
      festival: festival || 'DIWALI',
      badgeText: badgeText?.trim() || '',
      promoCode: promoCode?.trim()?.toUpperCase() || '',
      discountText: discountText?.trim() || '',
      ctaText: ctaText?.trim() || 'Explore Flights',
      ctaLink: ctaLink?.trim() || '/',
      imageUrl: imageUrl?.trim() || '',
      bgTheme: bgTheme || 'DIWALI_GOLD',
      customBgGradient: customBgGradient?.trim() || '',
      isActive: isActive !== undefined ? isActive : true,
      showTopStrip: showTopStrip !== undefined ? showTopStrip : true,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      priority: priority !== undefined ? Number(priority) : 1
    });

    res.status(201).json(banner);
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to create festive banner' });
  }
};

// @desc    Update an existing festive banner
// @route   PUT /api/festive-banners/:id
// @access  Admin only
export const updateBanner = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    if (updateData.startDate) {
      updateData.startDate = new Date(updateData.startDate);
    }
    if (updateData.endDate) {
      updateData.endDate = new Date(updateData.endDate);
    }

    const banner = await FestiveBanner.findByIdAndUpdate(id, updateData, { new: true });
    if (!banner) {
      return res.status(404).json({ message: 'Festive banner not found' });
    }

    res.json(banner);
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to update festive banner' });
  }
};

// @desc    Delete a festive banner
// @route   DELETE /api/festive-banners/:id
// @access  Admin only
export const deleteBanner = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const banner = await FestiveBanner.findByIdAndDelete(id);
    if (!banner) {
      return res.status(404).json({ message: 'Festive banner not found' });
    }

    res.json({ message: 'Festive banner deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to delete festive banner' });
  }
};

// @desc    Toggle banner active status
// @route   PATCH /api/festive-banners/:id/toggle
// @access  Admin only
export const toggleBannerStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const banner = await FestiveBanner.findById(id);
    if (!banner) {
      return res.status(404).json({ message: 'Festive banner not found' });
    }

    banner.isActive = !banner.isActive;
    await banner.save();

    res.json(banner);
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to toggle festive banner status' });
  }
};
