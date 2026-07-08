import { Document, Types } from 'mongoose';

export interface IAgentProfile extends Document {
  user: Types.ObjectId;
  gstNumber?: string;
  panNumber?: string;
  agencyName: string;
  walletBalance: number;
  creditLimit: number;
  commissionPercentage: number;
  createdAt: Date;
  updatedAt: Date;
}
