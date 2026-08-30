import mongoose, { Schema, Document } from 'mongoose';

export interface IPaymentRecord extends Document {
  agency: mongoose.Types.ObjectId;
  paymentMode: string;
  adminBank: mongoose.Types.ObjectId;
  depositAmount: number;
  transactionNo: string;
  depositDate: Date;
  depositAccount?: string;
  depositBranch?: string;
  remarks?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  raisedBy: mongoose.Types.ObjectId;
  processedBy?: mongoose.Types.ObjectId;
  type: 'INCOMING' | 'OUTGOING';
  createdAt: Date;
  updatedAt: Date;
}

const paymentRecordSchema = new Schema({
  agency: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  paymentMode: { type: String, required: true },
  adminBank: { type: Schema.Types.ObjectId, ref: 'AdminBank', required: true },
  depositAmount: { type: Number, required: true },
  transactionNo: { type: String, required: true },
  depositDate: { type: Date, required: true },
  depositAccount: { type: String },
  depositBranch: { type: String },
  remarks: { type: String },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  raisedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['INCOMING', 'OUTGOING'], default: 'INCOMING' }
}, {
  timestamps: true
});

export default mongoose.model<IPaymentRecord>('PaymentRecord', paymentRecordSchema);
