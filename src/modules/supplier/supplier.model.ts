import mongoose, { Schema, Document } from 'mongoose';

export interface ISupplier extends Document {
  name: string;
  type: 'API' | 'MANUAL';
  balance: number;
  creditLimit: number;
  apiConfig?: {
    endpoint?: string;
    apiKey?: string;
    secretKey?: string;
  };
  commission: {
    percentage: number;
    fixedAmount: number;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const supplierSchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    type: { type: String, enum: ['API', 'MANUAL'], required: true },
    balance: { type: Number, default: 0 },
    creditLimit: { type: Number, default: 0 },
    apiConfig: {
      endpoint: { type: String },
      apiKey: { type: String },
      secretKey: { type: String },
    },
    commission: {
      percentage: { type: Number, default: 0 },
      fixedAmount: { type: Number, default: 0 },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<ISupplier>('Supplier', supplierSchema);
