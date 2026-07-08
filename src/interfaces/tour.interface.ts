import { Document, Types } from 'mongoose';

export interface ITourPackage extends Document {
  title: string;
  slug: string;
  destination: Types.ObjectId;
  description: string;
  durationDays: number;
  durationNights: number;
  basePrice: number;
  b2bPrice: number;
  gallery: string[];
  inclusions: string[];
  exclusions: string[];
  itinerary: {
    day: number;
    title: string;
    description: string;
  }[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
