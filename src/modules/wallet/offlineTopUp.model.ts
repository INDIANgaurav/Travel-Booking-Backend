import mongoose, { Schema, Document } from 'mongoose';

export interface IOfflineTopUpRequest extends Document {
  agentId: mongoose.Types.ObjectId;
  amount: number;
  paymentMode: string;
  referenceNumber?: string;
  depositedBank?: string;
  depositedAccountNo?: string;
  chequeNumber?: string;
  remarks?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  processedBy?: mongoose.Types.ObjectId;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OfflineTopUpRequestSchema = new Schema(
  {
    agentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    paymentMode: { type: String, required: true },
    referenceNumber: { type: String },
    depositedBank: { type: String },
    depositedAccountNo: { type: String },
    chequeNumber: { type: String },
    remarks: { type: String },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    processedAt: { type: Date },
  },
  { timestamps: true }
);

export const OfflineTopUpRequest = mongoose.model<IOfflineTopUpRequest>(
  'OfflineTopUpRequest',
  OfflineTopUpRequestSchema
);
