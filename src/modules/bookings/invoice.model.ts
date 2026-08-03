import mongoose, { Schema, Document } from 'mongoose';

export interface ITaxInvoice extends Document {
  agentId: mongoose.Types.ObjectId;
  product: string;
  fromDate: string;
  toDate: string;
  status: string;
  totalBookings: number;
  totalSalesAmount: number;
  totalTaxes: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

const TaxInvoiceSchema = new Schema(
  {
    agentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: String, required: true },
    fromDate: { type: String, required: true },
    toDate: { type: String, required: true },
    status: { type: String, enum: ['PENDING', 'GENERATED', 'COMPLETED'], default: 'PENDING' },
    totalBookings: { type: Number, default: 0 },
    totalSalesAmount: { type: Number, default: 0 },
    totalTaxes: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
  },
  { timestamps: true }
);

export const TaxInvoice = mongoose.model<ITaxInvoice>('TaxInvoice', TaxInvoiceSchema);
