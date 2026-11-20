import { Request, Response } from 'express';
import { Markup } from './markup.model';

export const createMarkup = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user?._id || (req as any).user?.id;
    const { 
      product, 
      type, 
      markupType, 
      operator, 
      airline, 
      fareType, 
      value, 
      min, 
      minimumValue, 
      max, 
      maximumValue, 
      status 
    } = req.body;

    const newMarkup = new Markup({
      agentId,
      product: product || 'Flight',
      type: markupType || type || 'fixed',
      operator: operator || airline || 'ALL',
      fareType: fareType || 'BASIC',
      value: Number(value) || 0,
      min: Number(min ?? minimumValue) || 0,
      max: Number(max ?? maximumValue) || 100000,
      status: status || 'ACTIVE',
    });

    const savedMarkup = await newMarkup.save();
    res.status(201).json(savedMarkup);
  } catch (error) {
    console.error('Error creating markup:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getMarkups = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user?._id || (req as any).user?.id;
    const markups = await Markup.find({ agentId }).sort({ createdAt: -1 }).lean();
    res.status(200).json(markups);
  } catch (error) {
    console.error('Error fetching markups:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteMarkup = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user?._id || (req as any).user?.id;
    const { id } = req.params;
    
    await Markup.findOneAndDelete({ _id: id, agentId });
    res.status(200).json({ message: 'Markup deleted successfully' });
  } catch (error) {
    console.error('Error deleting markup:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
