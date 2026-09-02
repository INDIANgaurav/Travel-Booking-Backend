import { Request, Response } from 'express';
import Ticket from './ticket.model';
import User from '../users/user.model';

export const createTicket = async (req: Request, res: Response): Promise<void> => {
  try {
    const { subject, description, priority } = req.body;
    
    // @ts-ignore
    const userId = req.user._id;

    if (!subject || !description) {
      res.status(400).json({ success: false, message: 'Subject and description are required' });
      return;
    }

    const ticket = await Ticket.create({
      user: userId,
      subject,
      description,
      priority: priority || 'Medium',
      status: 'Open',
    });

    res.status(201).json({ success: true, data: ticket });
  } catch (error: any) {
    console.error('Error in createTicket:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getMyTickets = async (req: Request, res: Response): Promise<void> => {
  try {
    // @ts-ignore
    const userId = req.user._id;

    const tickets = await Ticket.find({ user: userId })
      .populate('messages.sender', 'name roles')
      .sort({ updatedAt: -1 });

    res.status(200).json({ success: true, count: tickets.length, data: tickets });
  } catch (error: any) {
    console.error('Error in getMyTickets:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getAllTickets = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, role } = req.query;
    
    let query: any = {};
    if (status) query.status = status;

    // We populate the user to get their role
    let tickets = await Ticket.find(query)
      .populate('user', 'name email roles')
      .populate('messages.sender', 'name roles')
      .sort({ updatedAt: -1 });

    if (role) {
      tickets = tickets.filter(ticket => {
        const userRoles = (ticket.user as any)?.roles || [];
        return userRoles.includes(role);
      });
    }

    res.status(200).json({ success: true, count: tickets.length, data: tickets });
  } catch (error: any) {
    console.error('Error in getAllTickets:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getTicketById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const ticket = await Ticket.findById(id)
      .populate('user', 'name email roles')
      .populate('messages.sender', 'name roles');

    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' });
      return;
    }

    res.status(200).json({ success: true, data: ticket });
  } catch (error: any) {
    console.error('Error in getTicketById:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const replyToTicket = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    // @ts-ignore
    const userId = req.user._id;

    if (!message) {
      res.status(400).json({ success: false, message: 'Message is required' });
      return;
    }

    const ticket = await Ticket.findById(id);

    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' });
      return;
    }

    ticket.messages.push({
      sender: userId,
      message,
      timestamp: new Date()
    });

    // If admin replies to an Open ticket, we can set it to In Progress
    // We can check if userId != ticket.user
    if (userId.toString() !== ticket.user.toString() && ticket.status === 'Open') {
      ticket.status = 'In Progress';
    }

    await ticket.save();

    res.status(200).json({ success: true, data: ticket });
  } catch (error: any) {
    console.error('Error in replyToTicket:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const updateTicketStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ success: false, message: 'Status is required' });
      return;
    }

    const ticket = await Ticket.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' });
      return;
    }

    res.status(200).json({ success: true, data: ticket });
  } catch (error: any) {
    console.error('Error in updateTicketStatus:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
