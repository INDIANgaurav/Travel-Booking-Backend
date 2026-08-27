import { Request, Response } from 'express';
import CugMapping from './cugMapping.model';
import User from '../users/user.model';
import Transaction from '../wallet/wallet.model';
import CommissionPlan from './commissionPlan.model';

// Get all CUG mappings for a specific supplier
export const getSupplierCugMappings = async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.params;
    const mappings = await CugMapping.find({ supplier: supplierId })
      .populate('agent', 'name email companyName role agentStatus')
      .populate('commissionPlanId', 'name type value')
      .sort({ createdAt: -1 });
    res.status(200).json(mappings);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Add or update an agent in a CUG supplier
export const assignAgentToCug = async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.params;
    const { agentId, creditLimit, isActive, limitDay, restrictAirline } = req.body;

    let mapping = await CugMapping.findOne({ supplier: supplierId, agent: agentId });
    
    if (mapping) {
      if (creditLimit !== undefined) {
        const diff = creditLimit - mapping.creditLimit;
        mapping.creditLimit = creditLimit;
        mapping.runningBalance = (mapping.runningBalance || 0) + diff;
      }
      if (isActive !== undefined) mapping.isActive = isActive;
      if (limitDay !== undefined) mapping.limitDay = limitDay;
      if (restrictAirline !== undefined) mapping.restrictAirline = restrictAirline;
      await mapping.save();
    } else {
      // Create new
      mapping = new CugMapping({
        supplier: supplierId,
        agent: agentId,
        creditLimit: creditLimit || 0,
        cashBalance: 0,
        runningBalance: creditLimit || 0, // initially running balance = credit limit + cash
        isActive: isActive !== undefined ? isActive : true,
        limitDay,
        restrictAirline
      });
      await mapping.save();
    }

    const populatedMapping = await CugMapping.findById(mapping._id).populate('agent', 'name email companyName role');
    res.status(200).json(populatedMapping);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Remove agent from CUG supplier
export const removeAgentFromCug = async (req: Request, res: Response) => {
  try {
    const { mappingId } = req.params;
    await CugMapping.findByIdAndDelete(mappingId);
    res.status(200).json({ message: 'Mapping removed successfully' });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Add Credit Note to CUG
export const addCreditNote = async (req: Request, res: Response) => {
  try {
    const { mappingId } = req.params;
    const { amount, description } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    const mapping = await CugMapping.findById(mappingId);
    if (!mapping) {
      return res.status(404).json({ message: 'CUG Mapping not found' });
    }

    // Update balances
    mapping.cashBalance = (mapping.cashBalance || 0) + amount;
    mapping.runningBalance = (mapping.runningBalance || 0) + amount;
    await mapping.save();

    // Create a transaction so it appears in the ledger
    const transaction = new Transaction({
      user: mapping.agent,
      type: 'CREDIT',
      amount: amount,
      description: `CUG Credit Note: ${description || 'Added by Admin'}`,
      paymentMethod: 'CUG_CREDIT_NOTE',
      productName: 'CUG',
      grossAmount: amount,
      netAmountDebited: 0,
      credit: amount
    });
    await transaction.save();

    res.status(200).json({ message: 'Credit Note added successfully', mapping });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Get all users (B2B agents) available to be added
export const getAvailableAgents = async (req: Request, res: Response) => {
  try {
    const agents = await User.find({ roles: { $in: ['B2B_AGENT'] }, isActive: true })
      .select('name companyName email');
    res.status(200).json(agents);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Map Commission Plan to CUG
export const mapCommissionPlan = async (req: Request, res: Response) => {
  try {
    const { mappingId } = req.params;
    const { commissionPlanId } = req.body;

    const mapping = await CugMapping.findById(mappingId);
    if (!mapping) {
      return res.status(404).json({ message: 'CUG Mapping not found' });
    }

    if (commissionPlanId) {
      const plan = await CommissionPlan.findById(commissionPlanId);
      if (!plan) return res.status(404).json({ message: 'Commission plan not found' });
    }

    mapping.commissionPlanId = commissionPlanId || undefined;
    await mapping.save();

    res.status(200).json({ message: 'Commission plan mapped successfully', mapping });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Get all Commission Plans
export const getCommissionPlans = async (req: Request, res: Response) => {
  try {
    const plans = await CommissionPlan.find({ isActive: true });
    // If empty, create a default one for testing
    if (plans.length === 0) {
      const defaultPlan = new CommissionPlan({
        name: 'Standard 2% Discount',
        type: 'PERCENTAGE',
        value: 2
      });
      await defaultPlan.save();
      plans.push(defaultPlan);
    }
    res.status(200).json(plans);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
