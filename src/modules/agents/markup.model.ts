import mongoose, { Schema, Document } from 'mongoose';

export interface IMarkup extends Document {
  agentId: mongoose.Types.ObjectId;
  product: string;
  type: string;
  operator: string;
  fareType: string;
  value: number; // Percentage
  min: number;
  max: number;
  status: string; // ACTIVE, INACTIVE
  createdAt: Date;
  updatedAt: Date;
}

const MarkupSchema = new Schema(
  {
    agentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: String, required: true },
    type: { type: String, required: true },
    operator: { type: String, required: true },
    fareType: { type: String, required: true },
    value: { type: Number, required: true },
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

export const Markup = mongoose.model<IMarkup>('Markup', MarkupSchema);
