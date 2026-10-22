import mongoose, { Schema, Document } from 'mongoose';

export interface IB2BClient extends Document {
  companyName: string;
  contactName: string;
  email: string;
  username?: string;
  password?: string;
  basicAuthKey?: string;
  auth_channel?: string;
  testApiKey: string;
  liveApiKey: string;
  status: 'Pending' | 'Testing' | 'Live' | 'Suspended';
  isVerified?: boolean;
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
    companyName: { type: String, default: 'B2B Partner' },
    contactName: { type: String, default: 'Partner Admin' },
    email: { type: String, required: true, unique: true },
    username: { type: String, sparse: true, index: true },
    password: { type: String },
    basicAuthKey: { type: String },
    auth_channel: { type: String, default: 'cugtest.trippechalo.com' },
    testApiKey: { type: String, required: true, unique: true },
    liveApiKey: { type: String, required: true, unique: true },
    status: { 
      type: String, 
      enum: ['Pending', 'Testing', 'Live', 'Suspended'], 
      default: 'Testing' 
    },
    isVerified: { type: Boolean, default: false },
    apiWalletBalance: { type: Number, default: 0 },
    webhookUrl: { type: String },
    allowedIPs: [{ type: String }],
    rateLimitPerMinute: { type: Number, default: 60 }, // Default 1 req/sec limit
    markupPercentage: { type: Number, default: 0 } // Extra margin we charge them
  },
  { timestamps: true }
);

// Indexes already created by unique: true on fields
const B2BClient = mongoose.model<IB2BClient>('B2BClient', b2bClientSchema);
export default B2BClient;
