import mongoose, { Schema, Document } from 'mongoose';

export interface IWithdrawalRequest extends Document {
  agentId: mongoose.Types.ObjectId;
  amount: number;
  bankDetails: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminRemarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WithdrawalRequestSchema = new Schema(
  {
    agentId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    bankDetails: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    adminRemarks: {
      type: String,
    },
  },
  { timestamps: true }
);

export const WithdrawalRequest = mongoose.model<IWithdrawalRequest>(
  'WithdrawalRequest',
  WithdrawalRequestSchema
);
