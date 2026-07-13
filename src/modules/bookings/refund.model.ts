import mongoose, { Schema, Document } from 'mongoose';

export interface IRefund extends Document {
  bookingId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  originalAmount: number;
  deductionAmount: number;
  refundAmount: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  reason?: string;
  razorpayRefundId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const refundSchema = new Schema<IRefund>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    originalAmount: { type: Number, required: true },
    deductionAmount: { type: Number, required: true },
    refundAmount: { type: Number, required: true },
    status: { type: String, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'], default: 'PROCESSING' },
    reason: { type: String },
    razorpayRefundId: { type: String },
  },
  {
    timestamps: true,
  }
);

const Refund = mongoose.model<IRefund>('Refund', refundSchema);
export default Refund;
