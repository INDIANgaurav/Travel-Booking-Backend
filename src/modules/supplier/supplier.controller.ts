import { Request, Response } from 'express';
import axios from 'axios';
import Supplier from './supplier.model';
import SupplierTransaction from './supplierTransaction.model';

// Create a new supplier
export const createSupplier = async (req: Request, res: Response) => {
  try {
    const supplier = new Supplier(req.body);
    await supplier.save();
    res.status(201).json(supplier);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Update an existing supplier
export const updateSupplier = async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.params;
    const supplier = await Supplier.findByIdAndUpdate(supplierId, req.body, { new: true });
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }
    res.status(200).json(supplier);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Get all suppliers
export const getAllSuppliers = async (req: Request, res: Response) => {
  try {
    const suppliers = await Supplier.find().sort({ createdAt: -1 });
    res.status(200).json(suppliers);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Top up or Deduct balance manually
export const addTransaction = async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.params;
    const { type, amount, description, referenceId } = req.body;

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    const transaction = new SupplierTransaction({
      supplierId,
      type,
      amount,
      description,
      referenceId
    });

    if (type === 'TOPUP' || type === 'REFUND') {
      supplier.balance += amount;
    } else if (type === 'DEDUCTION') {
      supplier.balance -= amount;
    } else if (type === 'RECONCILIATION') {
      // Amount can be positive or negative
      supplier.balance += amount;
    }

    await transaction.save();
    await supplier.save();

    res.status(201).json({ supplier, transaction });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Get transactions for a supplier
export const getSupplierTransactions = async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.params;
    const transactions = await SupplierTransaction.find({ supplierId }).sort({ createdAt: -1 });
    res.status(200).json(transactions);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Auto-Reconciliation logic
export const syncBalance = async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.params;
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    if (supplier.type !== 'API') {
      return res.status(400).json({ message: 'Can only sync balance for API suppliers' });
    }

    if (!supplier.apiConfig || !supplier.apiConfig.endpoint || !supplier.apiConfig.apiKey) {
      return res.status(400).json({ message: 'API configuration missing for this supplier' });
    }

    // Fetch live balance from supplier's API (Nexus DMC)
    const response = await axios.get(`${supplier.apiConfig.endpoint}/api/v1/accounts/balance`, {
      headers: {
        'Authorization': `Bearer ${supplier.apiConfig.apiKey}`, // Assuming API key is passed in Authorization header or adjust as needed
        'Content-Type': 'application/json'
      }
    });

    if (!response.data || !response.data.success || !response.data._data || !response.data._data.wallets) {
      return res.status(500).json({ message: 'Failed to fetch balance from Nexus API', details: response.data });
    }

    // Assuming we want the balance from the first wallet in the array
    const liveBalance = response.data._data.wallets[0].balance;

    const difference = liveBalance - supplier.balance;

    if (difference !== 0) {
      const transaction = new SupplierTransaction({
        supplierId,
        type: 'RECONCILIATION',
        amount: difference,
        description: `Auto-Reconciliation Sync. Prev: ${supplier.balance}, New: ${liveBalance}`,
      });
      supplier.balance = liveBalance;
      await transaction.save();
      await supplier.save();
    }

    res.status(200).json({ message: 'Balance synced successfully', balance: supplier.balance, synced: difference !== 0, difference });
  } catch (error: any) {
    console.error('Error syncing balance:', error.response?.data || error.message);
    res.status(500).json({ message: 'Error communicating with Supplier API', error: error.message });
  }
};
