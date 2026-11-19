import mongoose, { Schema, Document } from 'mongoose';

export interface ICheckoutAttempt extends Document {
  user: mongoose.Types.ObjectId;
  checkoutFingerprint: string;
  passengerFingerprint: string;
  flightFingerprint: string;
  idempotencyKey: string;
  status: 'INITIATED' | 'ORDER_CREATED' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
  ticketingStatus: 'UNCLAIMED' | 'CLAIMED' | 'CONFIRMED' | 'CANCELLED';
  claimedByBookingId?: string;
  claimedAt?: Date;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  bookingId?: string;
  totalAmount: number;
  paymentMethod: 'RAZORPAY' | 'WALLET';
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const checkoutAttemptSchema = new Schema<ICheckoutAttempt>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    checkoutFingerprint: { type: String, required: true, index: true },
    passengerFingerprint: { type: String, required: true },
    flightFingerprint: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    status: {
      type: String,
      enum: ['INITIATED', 'ORDER_CREATED', 'CONFIRMED', 'CANCELLED', 'EXPIRED'],
      default: 'INITIATED',
      index: true
    },
    ticketingStatus: {
      type: String,
      enum: ['UNCLAIMED', 'CLAIMED', 'CONFIRMED', 'CANCELLED'],
      default: 'UNCLAIMED',
      index: true
    },
    claimedByBookingId: { type: String },
    claimedAt: { type: Date },
    razorpayOrderId: { type: String, sparse: true, index: true },
    razorpayPaymentId: { type: String, sparse: true },
    bookingId: { type: String, index: true },
    totalAmount: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['RAZORPAY', 'WALLET'], required: true },
    expiresAt: { type: Date, required: true }
  },
  {
    timestamps: true
  }
);

// 1. Strict Idempotency Key Unique Index
checkoutAttemptSchema.index({ idempotencyKey: 1 }, { unique: true });

// 2. Database-Level Atomic Active Lock:
// Prevents two active checkout attempts for the SAME user and SAME passenger/flight combination,
// even if submitted with different idempotency keys or from different tabs!
checkoutAttemptSchema.index(
  { user: 1, checkoutFingerprint: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['INITIATED', 'ORDER_CREATED'] } }
  }
);

// 3. TTL Auto-Expiry index (cleans up after 48 hours)
checkoutAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 172800 });

const CheckoutAttempt = mongoose.model<ICheckoutAttempt>('CheckoutAttempt', checkoutAttemptSchema);
export default CheckoutAttempt;

