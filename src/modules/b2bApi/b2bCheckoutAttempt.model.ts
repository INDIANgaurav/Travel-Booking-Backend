import mongoose, { Document, Schema } from 'mongoose';

export interface IB2BCheckoutAttempt extends Document {
  partnerId: mongoose.Types.ObjectId;
  idempotencyKey: string;
  requestHash: string;
  environment: 'SANDBOX' | 'LIVE';
  status: 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  bookingId?: string;
  bookingRef?: mongoose.Types.ObjectId;
  responseSnapshot?: Record<string, any>;
  errorCode?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const b2bCheckoutAttemptSchema = new Schema<IB2BCheckoutAttempt>(
  {
    partnerId: { type: Schema.Types.ObjectId, ref: 'B2BClient', required: true },
    idempotencyKey: { type: String, required: true, trim: true },
    requestHash: { type: String, required: true },
    environment: { type: String, enum: ['SANDBOX', 'LIVE'], required: true },
    status: {
      type: String,
      enum: ['PROCESSING', 'SUCCEEDED', 'FAILED'],
      default: 'PROCESSING',
      required: true,
    },
    bookingId: { type: String },
    bookingRef: { type: Schema.Types.ObjectId, ref: 'Booking' },
    responseSnapshot: { type: Schema.Types.Mixed },
    errorCode: { type: String },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

// Guarantees only one booking execution per partner + idempotency key even under race conditions
b2bCheckoutAttemptSchema.index({ partnerId: 1, idempotencyKey: 1 }, { unique: true });

const B2BCheckoutAttempt = mongoose.model<IB2BCheckoutAttempt>('B2BCheckoutAttempt', b2bCheckoutAttemptSchema);
export default B2BCheckoutAttempt;

