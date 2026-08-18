import mongoose, { Document, Schema } from 'mongoose';

export interface IFlight extends Document {
  airline: string;
  airlineLogo: string;
  flightNumber: string;
  departureCity: string;
  departureAirportCode: string;
  arrivalCity: string;
  arrivalAirportCode: string;
  departureTime: Date;
  arrivalTime: Date;
  durationMinutes: number;
  price: number;
  stops: number; // 0 for non-stop, 1 for 1-stop, etc.
  availableSeats: number;
  cabinClass: string;
  supplierId?: mongoose.Types.ObjectId;
}

const flightSchema: Schema = new Schema(
  {
    airline: { type: String, required: true },
    airlineLogo: { type: String, required: true },
    flightNumber: { type: String, required: true },
    departureCity: { type: String, required: true },
    departureAirportCode: { type: String, required: true },
    arrivalCity: { type: String, required: true },
    arrivalAirportCode: { type: String, required: true },
    departureTime: { type: Date, required: true },
    arrivalTime: { type: Date, required: true },
    durationMinutes: { type: Number, required: true },
    price: { type: Number, required: true },
    stops: { type: Number, required: true, default: 0 },
    availableSeats: { type: Number, required: true, default: 60 },
    cabinClass: { type: String, required: true, default: 'Economy/ Premium Economy' },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
  },
  { timestamps: true }
);

// Indexes to speed up searching
flightSchema.index({ departureCity: 1, arrivalCity: 1, departureTime: 1 });
flightSchema.index({ departureAirportCode: 1, arrivalAirportCode: 1, departureTime: 1 });

export default mongoose.model<IFlight>('Flight', flightSchema);
