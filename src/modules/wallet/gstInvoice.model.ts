import mongoose, { Schema, Document } from 'mongoose';

export interface IGstInvoice extends Document {
  agentId: mongoose.Types.ObjectId;
  month: string;
  year: string;
  billNumber: string;
  billDate: string;
  taxableValue: number;
  sgst: number;
  cgst: number;
  igst: number;
  invoiceValue: number;
  totalAmount: number;
  status: string; // SUBMITTED, APPROVED, REJECTED
  createdAt: Date;
  updatedAt: Date;
}

const GstInvoiceSchema = new Schema(
  {
    agentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: String, required: true },
    year: { type: String, required: true },
    billNumber: { type: String, required: true },
    billDate: { type: String, required: true },
    taxableValue: { type: Number, required: true },
    sgst: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    invoiceValue: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    status: { type: String, enum: ['SUBMITTED', 'APPROVED', 'REJECTED'], default: 'SUBMITTED' },
  },
  { timestamps: true }
);

export const GstInvoice = mongoose.model<IGstInvoice>('GstInvoice', GstInvoiceSchema);
