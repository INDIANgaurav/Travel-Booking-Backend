import mongoose, { Schema, Document } from 'mongoose';

export interface IB2BClient extends Document {
  companyName: string;
  contactName: string;
  email: string;
  testApiKey: string;
  liveApiKey: string;
  status: 'Pending' | 'Testing' | 'Live' | 'Suspended';
  apiWalletBalance: number;
  webhookUrl?: string;
  allowedIPs: string[];
  rateLimitPerMinute: number;
  markupPercentage: number;
  createdAt: Date;
  updatedAt: Date;
}

const b2bClientSchema = new Schema<IB2BClient>(
  {
    companyName: { type: String, required: true },
    contactName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    testApiKey: { type: String, required: true, unique: true },
    liveApiKey: { type: String, required: true, unique: true },
    status: { 
      type: String, 
      enum: ['Pending', 'Testing', 'Live', 'Suspended'], 
      default: 'Testing' 
    },
    apiWalletBalance: { type: Number, default: 0 },
    webhookUrl: { type: String },
    allowedIPs: [{ type: String }],
    rateLimitPerMinute: { type: Number, default: 60 }, // Default 1 req/sec limit
    markupPercentage: { type: Number, default: 0 } // Extra margin we charge them
  },
  { timestamps: true }
);

// Indexes for fast lookup by API keys
b2bClientSchema.index({ testApiKey: 1 });
b2bClientSchema.index({ liveApiKey: 1 });
b2bClientSchema.index({ email: 1 });

const B2BClient = mongoose.model<IB2BClient>('B2BClient', b2bClientSchema);
export default B2BClient;
