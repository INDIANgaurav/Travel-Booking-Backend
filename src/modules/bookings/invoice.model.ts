import mongoose, { Schema, Document } from 'mongoose';

export interface ITaxInvoice extends Document {
  agentId: mongoose.Types.ObjectId;
  product: string;
  fromDate: string;
  toDate: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const TaxInvoiceSchema = new Schema(
  {
    agentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: String, required: true },
    fromDate: { type: String, required: true },
    toDate: { type: String, required: true },
    status: { type: String, enum: ['PENDING', 'GENERATED'], default: 'PENDING' },
  },
  { timestamps: true }
);

export const TaxInvoice = mongoose.model<ITaxInvoice>('TaxInvoice', TaxInvoiceSchema);
