import mongoose, { Document, Schema } from 'mongoose';

export interface IHotel extends Document {
  name: string;
  city: string;
  state: string;
  address: string;
  description: string;
  pricePerNight: number;
  images: string[];
  ownerId: mongoose.Types.ObjectId;
  amenities: string[];
  rating: number;
  source: 'direct';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

const hotelSchema = new Schema<IHotel>({
  name: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  address: { type: String, required: true },
  description: { type: String },
  pricePerNight: { type: Number, required: true },
  images: [{ type: String }],
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  amenities: [{ type: String }],
  rating: { type: Number, default: 0 },
  source: { type: String, default: 'direct' },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' }
}, {
  timestamps: true
});

export default mongoose.model<IHotel>('Hotel', hotelSchema);
