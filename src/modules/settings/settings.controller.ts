import { Request, Response } from 'express';
import { ServiceProvider, RoleMaster, PGMapping, DynamicPage } from './settings.model';
import User from '../users/user.model';

// --- SERVICE PROVIDERS ---
export const getServiceProviders = async (req: Request, res: Response) => {
  try {
    const providers = await ServiceProvider.find().populate('assignedUsers', 'name email').sort('-createdAt');
    res.json({ success: true, data: providers });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createServiceProvider = async (req: Request, res: Response) => {
  try {
    const provider = await ServiceProvider.create(req.body);
    res.status(201).json({ success: true, data: provider });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const updateServiceProvider = async (req: Request, res: Response) => {
  try {
    const provider = await ServiceProvider.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: provider });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// --- ROLE MASTER ---
export const getRoles = async (req: Request, res: Response) => {
  try {
    const roles = await RoleMaster.find().populate('createdBy', 'name');
    res.json({ success: true, data: roles });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createRole = async (req: Request, res: Response) => {
  try {
    const role = await RoleMaster.create({ ...req.body, createdBy: (req as any).user._id });
    res.status(201).json({ success: true, data: role });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const deleteRole = async (req: Request, res: Response) => {
  try {
    await RoleMaster.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Role deleted successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// --- PG MAPPING ---
export const getPGMappings = async (req: Request, res: Response) => {
  try {
    const mappings = await PGMapping.find().populate('user', 'name email roles');
    res.json({ success: true, data: mappings });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createPGMapping = async (req: Request, res: Response) => {
  try {
    const mapping = await PGMapping.create(req.body);
    await mapping.populate('user', 'name email roles');
    res.status(201).json({ success: true, data: mapping });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const deletePGMapping = async (req: Request, res: Response) => {
  try {
    await PGMapping.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Mapping deleted successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// --- DYNAMIC PAGES (CMS) ---
export const getDynamicPages = async (req: Request, res: Response) => {
  try {
    const pages = await DynamicPage.find();
    res.json({ success: true, data: pages });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getDynamicPageByName = async (req: Request, res: Response) => {
  try {
    const page = await DynamicPage.findOne({ pageName: req.params.name });
    if (!page) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }
    res.json({ success: true, data: page });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const saveDynamicPage = async (req: Request, res: Response) => {
  try {
    const { pageName, headline, content } = req.body;
    let page = await DynamicPage.findOne({ pageName });
    
    if (page) {
      page.headline = headline;
      page.content = content;
      await page.save();
    } else {
      page = await DynamicPage.create(req.body);
    }
    
    res.json({ success: true, data: page });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Helper for UI Dropdowns
export const getB2BAgents = async (req: Request, res: Response) => {
  try {
    const agents = await User.find({ roles: { $in: ['B2B_AGENT'] } }).select('name email _id');
    res.json({ success: true, data: agents });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
