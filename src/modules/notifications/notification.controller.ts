import { Request, Response } from 'express';
import Notification from './notification.model';
import { getIo } from '../../config/socket';

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const notifications = await Notification.find().sort({ createdAt: -1 }).limit(50);
    const unreadCount = await Notification.countDocuments({ isRead: false });
    
    res.json({
      notifications,
      unreadCount
    });
  } catch (error: any) {
    console.error('Failed to get notifications:', error);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.body; // if id is provided, mark one, else mark all
    
    if (id) {
      await Notification.findByIdAndUpdate(id, { isRead: true });
    } else {
      await Notification.updateMany({ isRead: false }, { isRead: true });
    }
    
    res.json({ message: 'Notifications marked as read' });
  } catch (error: any) {
    console.error('Failed to mark notifications as read:', error);
    res.status(500).json({ message: 'Failed to mark as read' });
  }
};

export const clearAllNotifications = async (req: Request, res: Response) => {
  try {
    const type = req.query.type as any;
    if (type && type !== 'ALL') {
      await Notification.deleteMany({ type });
    } else {
      await Notification.deleteMany({});
    }
    res.json({ message: 'Notifications cleared successfully' });
  } catch (error: any) {
    console.error('Failed to clear notifications:', error);
    res.status(500).json({ message: 'Failed to clear notifications' });
  }
};

export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await Notification.findByIdAndDelete(id);
    res.json({ message: 'Notification deleted successfully' });
  } catch (error: any) {
    console.error('Failed to delete notification:', error);
    res.status(500).json({ message: 'Failed to delete notification' });
  }
};

export const createAdminNotification = async (
  title: string,
  message: string,
  type: 'AGENT_REGISTRATION' | 'BOOKING_CANCELLED' | 'REFUND_PENDING' | 'SYSTEM',
  link?: string
) => {
  try {
    const notification = new Notification({
      title,
      message,
      type,
      link
    });
    
    await notification.save();
    
    // Emit real-time socket event to all connected admins
    const io = getIo();
    if (io) {
      io.to('admin_dashboard').emit('new_admin_notification', notification);
    }
    
  } catch (error) {
    console.error('Failed to create admin notification:', error);
  }
};
