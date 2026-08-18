console.log('--- SUPPLIER ROUTES LOADED ---');
import express from 'express';
import {
  createSupplier,
  updateSupplier,
  getAllSuppliers,
  addTransaction,
  getSupplierTransactions,
  syncBalance
} from './supplier.controller';
import { protect } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/rbac.middleware';

const router = express.Router();

// Only Admins and Super Admins can manage suppliers
router.use(protect, authorizeRoles('ADMIN', 'SUPER_ADMIN', 'SUB_ADMIN'));

router.post('/', createSupplier);
router.put('/:supplierId', updateSupplier);
router.get('/', getAllSuppliers);

router.post('/:supplierId/transactions', addTransaction);
router.get('/:supplierId/transactions', getSupplierTransactions);

router.post('/:supplierId/sync', syncBalance);

export default router;

