import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISupplierTransaction extends Document {
  supplierId: Types.ObjectId;
  type: 'TOPUP' | 'DEDUCTION' | 'REFUND' | 'RECONCILIATION';
  amount: number;
  description: string;
  referenceId?: string; // Optional booking ID or UTR number
  createdAt: Date;
  updatedAt: Date;
}

const supplierTransactionSchema: Schema = new Schema(
  {
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    type: { type: String, enum: ['TOPUP', 'DEDUCTION', 'REFUND', 'RECONCILIATION'], required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    referenceId: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<ISupplierTransaction>('SupplierTransaction', supplierTransactionSchema);
