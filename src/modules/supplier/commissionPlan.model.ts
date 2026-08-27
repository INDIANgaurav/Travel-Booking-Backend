import mongoose, { Schema, Document } from 'mongoose';

export interface ICommissionPlan extends Document {
  name: string;
  type: 'PERCENTAGE' | 'FIXED';
  value: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const commissionPlanSchema = new Schema<ICommissionPlan>(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ['PERCENTAGE', 'FIXED'], required: true },
    value: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const CommissionPlan = mongoose.model<ICommissionPlan>('CommissionPlan', commissionPlanSchema);
export default CommissionPlan;
