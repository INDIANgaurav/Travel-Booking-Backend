import { Router } from 'express';
import { protect, isAdminOrSubAdmin } from '../../middleware/auth.middleware';
import {
  getServiceProviders, createServiceProvider, updateServiceProvider,
  getRoles, createRole, updateRole, deleteRole,
  getPGMappings, createPGMapping, deletePGMapping,
  getDynamicPages, getDynamicPageByName, saveDynamicPage,
  getB2BAgents,
  getGeneralSettings, saveGeneralSettings,
  getAnnouncements, getActiveAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement
} from './settings.controller';

const router = Router();

// Public routes for CMS content
router.get('/pages/:name', getDynamicPageByName);
router.get('/general', getGeneralSettings);
router.get('/announcements/active', getActiveAnnouncements); // Public/Agent route to fetch active announcements

// Admin Only Routes
router.use(protect);
router.use(isAdminOrSubAdmin);

// Service Providers
router.get('/providers', getServiceProviders);
router.post('/providers', createServiceProvider);
router.put('/providers/:id', updateServiceProvider);

// Roles
router.get('/roles', getRoles);
router.post('/roles', createRole);
router.put('/roles/:id', updateRole);
router.delete('/roles/:id', deleteRole);

// PG Mappings
router.get('/pg-mappings', getPGMappings);
router.post('/pg-mappings', createPGMapping);
router.delete('/pg-mappings/:id', deletePGMapping);

// Dynamic Pages (CMS)
router.get('/pages', getDynamicPages);
router.post('/pages', saveDynamicPage);

// Helpers
router.get('/agents', getB2BAgents);

// General Settings
router.post('/general', saveGeneralSettings);

// Announcements
router.get('/announcements', getAnnouncements);
router.post('/announcements', createAnnouncement);
router.put('/announcements/:id', updateAnnouncement);
router.delete('/announcements/:id', deleteAnnouncement);

export default router;
