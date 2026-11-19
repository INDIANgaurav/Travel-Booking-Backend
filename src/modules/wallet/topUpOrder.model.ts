import mongoose, { Schema, Document } from 'mongoose';

export interface ITopUpOrder extends Document {
  orderId: string;
  user: mongoose.Types.ObjectId;
  baseAmount: number;
  surcharge: number;
  totalPayable: number;
  currency: string;
  status: 'CREATED' | 'CREDITED' | 'FAILED';
  paymentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const topUpOrderSchema = new Schema<ITopUpOrder>(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    baseAmount: { type: Number, required: true },
    surcharge: { type: Number, default: 0 },
    totalPayable: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['CREATED', 'CREDITED', 'FAILED'], default: 'CREATED', index: true },
    paymentId: { type: String },
  },
  { timestamps: true }
);

topUpOrderSchema.index({ orderId: 1 }, { unique: true });
topUpOrderSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model<ITopUpOrder>('TopUpOrder', topUpOrderSchema);

