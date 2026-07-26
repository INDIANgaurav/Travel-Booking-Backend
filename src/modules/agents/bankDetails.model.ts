import mongoose, { Schema, Document } from 'mongoose';

export interface IBankDetails extends Document {
  agentId: mongoose.Types.ObjectId;
  accountName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
  upiId?: string;
  status: string; // PENDING, APPROVED, REJECTED
  createdAt: Date;
  updatedAt: Date;
}

const BankDetailsSchema = new Schema(
  {
    agentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    accountName: { type: String, required: true },
    bankName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    ifscCode: { type: String, required: true },
    branchName: { type: String, required: true },
    upiId: { type: String },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  },
  { timestamps: true }
);

export const BankDetails = mongoose.model<IBankDetails>('BankDetails', BankDetailsSchema);
