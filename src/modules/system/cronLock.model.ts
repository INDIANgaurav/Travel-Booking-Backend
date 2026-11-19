import mongoose, { Schema, Document } from 'mongoose';

export interface ICronLock extends Document {
  _id: any;
  lockedUntil: Date;
  lockedBy: string;
  updatedAt: Date;
}

const cronLockSchema = new Schema<ICronLock>(
  {
    _id: { type: String, required: true },
    lockedUntil: { type: Date, required: true },
    lockedBy: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<ICronLock>('CronLock', cronLockSchema);
