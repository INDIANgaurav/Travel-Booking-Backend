import { Request, Response } from 'express';
import Destination from './destination.model';
import TourPackage from './tour.model';

// --- DESTINATIONS ---

// @desc    Get all active destinations
// @route   GET /api/tours/destinations
// @access  Public
export const getDestinations = async (req: Request, res: Response) => {
  try {
    const destinations = await Destination.find({ isActive: true }).lean();
    res.json(destinations);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a destination
// @route   POST /api/tours/destinations
// @access  Private (Admin)
export const createDestination = async (req: Request, res: Response) => {
  try {
    const destination = await Destination.create(req.body);
    res.status(201).json(destination);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// --- TOUR PACKAGES ---

// @desc    Get all active tour packages
// @route   GET /api/tours/packages
// @access  Public
export const getTourPackages = async (req: Request, res: Response) => {
  try {
    // Populate destination details to show in cards
    const tours = await TourPackage.find({ isActive: true }).populate('destination', 'name city country').lean();
    res.json(tours);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single tour package by slug
// @route   GET /api/tours/packages/:slug
// @access  Public
export const getTourPackageBySlug = async (req: Request, res: Response) => {
  try {
    const tour = await TourPackage.findOne({ slug: req.params.slug, isActive: true }).populate('destination', 'name city country');
    if (tour) {
      res.json(tour);
    } else {
      res.status(404).json({ message: 'Tour package not found' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a tour package
// @route   POST /api/tours/packages
// @access  Private (Admin)
export const createTourPackage = async (req: Request, res: Response) => {
  try {
    const tour = await TourPackage.create(req.body);
    res.status(201).json(tour);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
