import mongoose, { Schema, Document } from 'mongoose';

export interface IOfflineBooking extends Document {
  agentId: mongoose.Types.ObjectId;
  name: string;
  mobile: string;
  email: string;
  address?: string;
  origin: string;
  destination: string;
  bookingType: string;
  travelType: string;
  onwardDate: string;
  classOnward?: string;
  airlineCode?: string;
  flightCode?: string;
  adults: number;
  child: number;
  infants: number;
  remarks: string;
  flexibilityPrice: boolean;
  flexibilityDate: boolean;
  flexibilityFlight: boolean;
  tabType: string; // GROUP BOOKING, LTC OFFLINE BOOKING, INTERNATIONAL BOOKING
  status: string; // PENDING, CONFIRMED, REJECTED
  createdAt: Date;
  updatedAt: Date;
}

const OfflineBookingSchema = new Schema(
  {
    agentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    mobile: { type: String, required: true },
    email: { type: String, required: true },
    address: { type: String },
    origin: { type: String, required: true },
    destination: { type: String, required: true },
    bookingType: { type: String, required: true },
    travelType: { type: String, required: true },
    onwardDate: { type: String, required: true },
    classOnward: { type: String },
    airlineCode: { type: String },
    flightCode: { type: String },
    adults: { type: Number, default: 1 },
    child: { type: Number, default: 0 },
    infants: { type: Number, default: 0 },
    remarks: { type: String, required: true },
    flexibilityPrice: { type: Boolean, default: false },
    flexibilityDate: { type: Boolean, default: false },
    flexibilityFlight: { type: Boolean, default: false },
    tabType: { type: String, required: true },
    status: { type: String, enum: ['PENDING', 'CONFIRMED', 'REJECTED'], default: 'PENDING' },
  },
  { timestamps: true }
);

export const OfflineBooking = mongoose.model<IOfflineBooking>('OfflineBooking', OfflineBookingSchema);
