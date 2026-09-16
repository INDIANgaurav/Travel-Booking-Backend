import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  title: string;
  message: string;
  type: 'AGENT_REGISTRATION' | 'BOOKING_CANCELLED' | 'REFUND_PENDING' | 'SYSTEM';
  link?: string;
  isRead: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['AGENT_REGISTRATION', 'BOOKING_CANCELLED', 'REFUND_PENDING', 'SYSTEM'],
      required: true 
    },
    link: { type: String },
    isRead: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model<INotification>('Notification', notificationSchema);
