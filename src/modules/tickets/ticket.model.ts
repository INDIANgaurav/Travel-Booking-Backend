import mongoose, { Document, Schema } from 'mongoose';

export interface ITicketMessage {
  sender: mongoose.Types.ObjectId; // Reference to User
  message: string;
  timestamp: Date;
}

export interface ITicket extends Document {
  user: mongoose.Types.ObjectId; // Reference to User (B2C, B2B, etc.)
  subject: string;
  description: string;
  priority: 'Low' | 'Medium' | 'High';
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  messages: ITicketMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const TicketMessageSchema = new Schema<ITicketMessage>({
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const TicketSchema = new Schema<ITicket>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Medium',
    },
    status: {
      type: String,
      enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
      default: 'Open',
    },
    messages: [TicketMessageSchema],
  },
  { timestamps: true }
);

const Ticket = mongoose.model<ITicket>('Ticket', TicketSchema);
export default Ticket;
