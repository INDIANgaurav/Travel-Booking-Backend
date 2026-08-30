import mongoose, { Document, Schema } from 'mongoose';

export interface ICommissionPlan extends Document {
  name: string;
  priority: number;
  type: string;
  category: string;
  airline: string;
  status: boolean;
  fees: Record<string, any>;
  createdAt: Date;
}

const CommissionPlanSchema = new Schema<ICommissionPlan>({
  name: { type: String, required: true },
  priority: { type: Number, required: true, default: 1 },
  type: { type: String, required: true },
  category: { type: String, required: true },
  airline: { type: String, default: 'ALL' },
  status: { type: Boolean, default: false },
  fees: { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

export const CommissionPlan = mongoose.model<ICommissionPlan>('AppCommissionPlan', CommissionPlanSchema);

export interface ICommissionGroup extends Document {
  name: string;
  description: string;
  planName: string;
  code: string;
  createdAt: Date;
}

const CommissionGroupSchema = new Schema<ICommissionGroup>({
  name: { type: String, required: true },
  description: { type: String },
  planName: { type: String },
  code: { type: String, required: true, unique: true },
}, {
  timestamps: true,
});

export const CommissionGroup = mongoose.model<ICommissionGroup>('CommissionGroup', CommissionGroupSchema);
