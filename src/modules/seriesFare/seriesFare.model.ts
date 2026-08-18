import mongoose, { Schema, Document } from 'mongoose';

export interface ISeriesFare extends Document {
  supplierId?: mongoose.Types.ObjectId;
  supplierName?: string;
  sfId: string;
  airline: string;
  airlinePnr: string;
  bookingType: 'ONE_WAY' | 'ROUND_TRIP';
  origin: string;
  destination: string;
  flightNo: string;
  departureTime: string;
  arrivalTime: string;
  departureTerminal?: string;
  arrivalTerminal?: string;
  travelDate: Date;
  adtFare: number;
  chdFare: number;
  infFare: number;
  agentCommission: number;
  totalSeats: number;
  availableSeats: number;
  realtimeBook: boolean;
  status: 'Active' | 'Inactive' | 'SoldOut';
  createdAt: Date;
  updatedAt: Date;
}

const seriesFareSchema = new Schema<ISeriesFare>(
  {
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    supplierName: { type: String, default: 'PJ HOLIDAY BOOKERS' },
    sfId: { type: String, required: true, unique: true },
    airline: { type: String, required: true },
    airlinePnr: { type: String, required: true },
    bookingType: { type: String, enum: ['ONE_WAY', 'ROUND_TRIP'], default: 'ONE_WAY' },
    origin: { type: String, required: true, uppercase: true },
    destination: { type: String, required: true, uppercase: true },
    flightNo: { type: String, required: true },
    departureTime: { type: String, required: true },
    arrivalTime: { type: String, required: true },
    departureTerminal: { type: String, default: '' },
    arrivalTerminal: { type: String, default: '' },
    travelDate: { type: Date, required: true },
    adtFare: { type: Number, required: true },
    chdFare: { type: Number, required: true, default: 0 },
    infFare: { type: Number, required: true, default: 0 },
    agentCommission: { type: Number, required: true, default: 0 },
    totalSeats: { type: Number, required: true, default: 10 },
    availableSeats: { type: Number, required: true, default: 10 },
    realtimeBook: { type: Boolean, default: true },
    status: { type: String, enum: ['Active', 'Inactive', 'SoldOut'], default: 'Active' },
  },
  { timestamps: true }
);

seriesFareSchema.index({ origin: 1, destination: 1 });
seriesFareSchema.index({ travelDate: 1 });
seriesFareSchema.index({ supplierId: 1, status: 1 });
seriesFareSchema.index({ airline: 1 });
seriesFareSchema.index({ status: 1 });

const SeriesFare = mongoose.model<ISeriesFare>('SeriesFare', seriesFareSchema);
export default SeriesFare;
