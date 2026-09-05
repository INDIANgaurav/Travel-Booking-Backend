import mongoose, { Schema, Document } from 'mongoose';

export interface ISeatHold extends Document {
  userId: mongoose.Types.ObjectId;
  flightId: mongoose.Types.ObjectId;
  paxCount: number;
  lockedFare: number;
  status: 'ACTIVE' | 'BOOKED' | 'EXPIRED' | 'RELEASED';
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const seatHoldSchema = new Schema<ISeatHold>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    flightId: { type: Schema.Types.ObjectId, ref: 'SeriesFare', required: true },
    paxCount: { type: Number, required: true },
    lockedFare: { type: Number, required: true },
    status: { type: String, enum: ['ACTIVE', 'BOOKED', 'EXPIRED', 'RELEASED'], default: 'ACTIVE' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// We need a unique compound index to ensure a user can only have ONE active hold for a specific flight
seatHoldSchema.index({ userId: 1, flightId: 1, status: 1 });

const SeatHold = mongoose.model<ISeatHold>('SeatHold', seatHoldSchema);
export default SeatHold;
