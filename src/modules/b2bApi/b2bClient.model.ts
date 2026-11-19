import mongoose, { Schema, Document } from 'mongoose';

export interface IB2BClient extends Document {
  companyName: string;
  contactName: string;
  email: string;
  username?: string;
  /** @deprecated Legacy plaintext field removed during migration; use passwordHash only */
  password?: string;
  passwordHash?: string;
  /** @deprecated Legacy plaintext field removed during migration */
  basicAuthKey?: string;
  auth_channel?: string;
  testApiKey: string;
  liveApiKey: string;
  status: 'Pending' | 'Testing' | 'Live' | 'Suspended';
  isVerified?: boolean;
  apiWalletBalance: number;
  sandboxWalletBalance: number;
  webhookUrl?: string;
  allowedIPs: string[];
  rateLimitPerMinute: number;
  searchRateLimitPerMinute: number;
  bookingRateLimitPerMinute: number;
  tokenRateLimitPerMinute: number;
  markupPercentage: number;
  infantRequiresSeat: boolean;
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const b2bClientSchema = new Schema<IB2BClient>(
  {
    companyName: { type: String, default: 'B2B Partner' },
    contactName: { type: String, default: 'Partner Admin' },
    email: { type: String, required: true, unique: true },
    username: { type: String, sparse: true, index: true },
    password: { type: String, select: false },
    passwordHash: { type: String, select: false },
    basicAuthKey: { type: String, select: false },
    auth_channel: { type: String, default: 'cugtest.trippechalo.com' },
    testApiKey: { type: String, required: true, unique: true },
    liveApiKey: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['Pending', 'Testing', 'Live', 'Suspended'],
      default: 'Testing',
    },
    isVerified: { type: Boolean, default: false },
    apiWalletBalance: { type: Number, default: 0 },
    sandboxWalletBalance: { type: Number, default: 500000 },
    webhookUrl: { type: String },
    allowedIPs: [{ type: String }],
    rateLimitPerMinute: { type: Number, default: 60 },
    searchRateLimitPerMinute: { type: Number, default: 300 },
    bookingRateLimitPerMinute: { type: Number, default: 30 },
    tokenRateLimitPerMinute: { type: Number, default: 10 },
    markupPercentage: { type: Number, default: 0 }, // Extra margin we charge them
    infantRequiresSeat: { type: Boolean, default: false }, // Lap infants occupy 0 seats by default
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const B2BClient = mongoose.model<IB2BClient>('B2BClient', b2bClientSchema);
export default B2BClient;
