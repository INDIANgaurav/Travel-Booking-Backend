import mongoose, { Document, Schema } from 'mongoose';

export interface IB2BRateLimit extends Document {
  key: string;
  count: number;
  resetAt: Date;
}

const b2bRateLimitSchema = new Schema<IB2BRateLimit>(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    resetAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: false }
);

const B2BRateLimit = mongoose.model<IB2BRateLimit>('B2BRateLimit', b2bRateLimitSchema);
export default B2BRateLimit;

