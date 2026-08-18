import Supplier from './supplier.model';
import User from '../users/user.model';

const defaultSuppliers = [
  {
    name: 'Nexus DMC',
    type: 'API',
    balance: 50000,
    creditLimit: 10000,
    commission: { percentage: 5, fixedAmount: 200 },
    isActive: true
  }
];

export const seedSuppliers = async () => {
  try {
    // Cleanup old hardcoded Series Fare
    await Supplier.deleteOne({ name: 'Series Fare' });

    for (const supplier of defaultSuppliers) {
      const existing = await Supplier.findOne({ name: supplier.name });
      if (!existing) {
        await Supplier.create(supplier as any);
        console.log(`[Supplier Auto-Sync] Added missing supplier: ${supplier.name}`);
      }
    }

    // Sync manual suppliers (SUPPLIER_AGENT role)
    const manualAgents = await User.find({ role: 'SUPPLIER_AGENT' });
    for (const agent of manualAgents) {
      const supplierName = agent.companyName || agent.name || 'Unknown Supplier';
      const existing = await Supplier.findOne({ name: supplierName });
      if (!existing) {
        await Supplier.create({
          name: supplierName,
          type: 'MANUAL',
          balance: 0,
          creditLimit: 0,
          commission: { percentage: 0, fixedAmount: 0 },
          isActive: true
        } as any);
        console.log(`[Supplier Auto-Sync] Added manual supplier from users: ${supplierName}`);
      }
    }
  } catch (error) {
    console.error('[Supplier Auto-Sync] Failed to sync default suppliers:', error);
  }
};
