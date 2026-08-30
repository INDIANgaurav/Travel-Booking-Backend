import mongoose, { Schema, Document } from 'mongoose';

export interface IAdminBank extends Document {
  bankName: string;
  accountNo: string;
  accountName: string;
  branch: string;
  ifscCode: string;
  upiId?: string;
  createdBy: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const adminBankSchema = new Schema({
  bankName: { type: String, required: true },
  accountNo: { type: String, required: true, unique: true },
  accountName: { type: String, required: true },
  branch: { type: String, required: true },
  ifscCode: { type: String, required: true },
  upiId: { type: String },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

export default mongoose.model<IAdminBank>('AdminBank', adminBankSchema);
