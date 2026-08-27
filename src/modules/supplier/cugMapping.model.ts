import mongoose, { Schema, Document } from 'mongoose';

export interface ICugMapping extends Document {
  supplier: mongoose.Types.ObjectId;
  agent: mongoose.Types.ObjectId;
  creditLimit: number;
  cashBalance: number;
  runningBalance: number;
  commissionPlanId?: mongoose.Types.ObjectId;
  limitDay?: number;
  restrictAirline?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const cugMappingSchema = new Schema<ICugMapping>(
  {
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    agent: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    creditLimit: { type: Number, default: 0 },
    cashBalance: { type: Number, default: 0 },
    runningBalance: { type: Number, default: 0 },
    commissionPlanId: { type: Schema.Types.ObjectId, ref: 'CommissionPlan' }, // Placeholder for future
    limitDay: { type: Number },
    restrictAirline: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Ensure an agent can only be mapped to a specific supplier once
cugMappingSchema.index({ supplier: 1, agent: 1 }, { unique: true });

const CugMapping = mongoose.model<ICugMapping>('CugMapping', cugMappingSchema);
export default CugMapping;
