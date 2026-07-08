import { Document } from 'mongoose';

export interface IDestination extends Document {
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  country: string;
  city: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
