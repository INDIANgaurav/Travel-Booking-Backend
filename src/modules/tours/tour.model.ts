import mongoose, { Schema } from 'mongoose';
import { ITourPackage } from '../../interfaces/tour.interface';

const tourSchema = new Schema<ITourPackage>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    destination: {
      type: Schema.Types.ObjectId,
      ref: 'Destination',
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    durationDays: {
      type: Number,
      required: true,
    },
    durationNights: {
      type: Number,
      required: true,
    },
    basePrice: {
      type: Number,
      required: true,
    },
    b2bPrice: {
      type: Number,
      required: true,
    },
    gallery: [
      {
        type: String,
      },
    ],
    inclusions: [
      {
        type: String,
      },
    ],
    exclusions: [
      {
        type: String,
      },
    ],
    itinerary: [
      {
        day: { type: Number, required: true },
        title: { type: String, required: true },
        description: { type: String, required: true },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const TourPackage = mongoose.model<ITourPackage>('TourPackage', tourSchema);
export default TourPackage;
