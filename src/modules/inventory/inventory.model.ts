import mongoose, { Schema, Document } from 'mongoose';

// --- FLIGHT MODEL ---
export interface IFlight extends Document {
  airline: string;
  flightNumber: string;
  from: string;
  to: string;
  departureTime: Date;
  arrivalTime: Date;
  price: number;
  duration: string;
  stops: number;
}

const flightSchema = new Schema<IFlight>({
  airline: { type: String, required: true },
  flightNumber: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  departureTime: { type: Date, required: true },
  arrivalTime: { type: Date, required: true },
  price: { type: Number, required: true },
  duration: { type: String, required: true },
  stops: { type: Number, required: true, default: 0 },
});

export const Flight = mongoose.model<IFlight>('Flight', flightSchema);

// --- HOTEL MODEL ---
export interface IHotel extends Document {
  name: string;
  location: string;
  rating: number;
  pricePerNight: number;
  amenities: string[];
  imageUrl: string;
}

const hotelSchema = new Schema<IHotel>({
  name: { type: String, required: true },
  location: { type: String, required: true },
  rating: { type: Number, required: true },
  pricePerNight: { type: Number, required: true },
  amenities: [{ type: String }],
  imageUrl: { type: String },
});

export const Hotel = mongoose.model<IHotel>('Hotel', hotelSchema);

// --- BUS MODEL ---
export interface IBus extends Document {
  operator: string;
  from: string;
  to: string;
  departureTime: Date;
  arrivalTime: Date;
  price: number;
  busType: string; // e.g., 'A/C Sleeper', 'Volvo Semi Sleeper'
}

const busSchema = new Schema<IBus>({
  operator: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  departureTime: { type: Date, required: true },
  arrivalTime: { type: Date, required: true },
  price: { type: Number, required: true },
  busType: { type: String, required: true },
});

export const Bus = mongoose.model<IBus>('Bus', busSchema);
