import { Request, Response } from 'express';
import { BankDetails } from './bankDetails.model';

export const saveBankDetails = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const data = req.body;

    let bankDetails = await BankDetails.findOne({ agentId });

    if (bankDetails) {
      // Update existing
      bankDetails = await BankDetails.findOneAndUpdate({ agentId }, data, { new: true });
    } else {
      // Create new
      const newBankDetails = new BankDetails({
        agentId,
        ...data,
      });
      bankDetails = await newBankDetails.save();
    }

    res.status(200).json({ message: 'Bank details saved successfully', bankDetails });
  } catch (error) {
    console.error('Error saving bank details:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getBankDetails = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const bankDetails = await BankDetails.findOne({ agentId });
    
    if (!bankDetails) {
      return res.status(404).json({ message: 'No bank details found' });
    }

    res.status(200).json(bankDetails);
  } catch (error) {
    console.error('Error fetching bank details:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
