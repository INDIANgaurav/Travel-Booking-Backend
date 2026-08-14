import { Request, Response } from 'express';
import { Markup } from './markup.model';

export const createMarkup = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const { product, type, operator, fareType, value, min, max } = req.body;

    const newMarkup = new Markup({
      agentId,
      product,
      type,
      operator,
      fareType,
      value,
      min,
      max,
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
    const agentId = (req as any).user.id;
    const markups = await Markup.find({ agentId }).sort({ createdAt: -1 }).lean();
    res.status(200).json(markups);
  } catch (error) {
    console.error('Error fetching markups:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteMarkup = async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).user.id;
    const { id } = req.params;
    
    await Markup.findOneAndDelete({ _id: id, agentId });
    res.status(200).json({ message: 'Markup deleted successfully' });
  } catch (error) {
    console.error('Error deleting markup:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
