import mongoose, { Schema, Document } from 'mongoose';

export interface IOffer extends Document {
  title: string;
  description: string;
  code: string;
  type: 'FLIGHT' | 'HOTEL' | 'PACKAGE' | 'BUS';
  isActive: boolean;
  createdAt: Date;
}

const offerSchema = new Schema<IOffer>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    code: { type: String, required: true },
    type: { type: String, enum: ['FLIGHT', 'HOTEL', 'PACKAGE', 'BUS'], required: true },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

const Offer = mongoose.model<IOffer>('Offer', offerSchema);
export default Offer;
