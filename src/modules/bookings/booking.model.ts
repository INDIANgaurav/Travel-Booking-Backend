import mongoose, { Schema, Document } from 'mongoose';

export interface IBooking extends Document {
  user: mongoose.Types.ObjectId;
  bookingId: string;
  type: 'FLIGHT' | 'HOTEL' | 'PACKAGE' | 'BUS';
  status: 'INITIATED' | 'PAYMENT_PENDING' | 'TICKETING_IN_PROGRESS' | 'CONFIRMED' | 'FAILED_REFUNDING' | 'FAILED' | 'CANCELLED';
  idempotencyKey?: string;
  totalAmount: number;
  date: string;
  bookingMode: 'PERSONAL' | 'MYBIZ';
  paymentMethod?: 'RAZORPAY' | 'WALLET';  
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  promoCodeApplied?: string;
  discountAmount?: number;

  // Cancellation Fields
  cancellationReason?: string;
  cancelledAt?: Date;
  refundStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NONE';
  refundAmount?: number;

  details: {
    airline?: string;
    from?: string;
    to?: string;
    destination?: string;
    passengers?: Array<{ name: string; gender: string; type: string; dob?: string; passportNum?: string; passportExpiry?: string; nationality?: string; }>;
    contactDetails?: { email: string; phone: string; countryCode: string };
    seats?: string[];
    flightId?: mongoose.Types.ObjectId;
    pnr?: string;
    nexus_response?: any;
    api_error?: string;
    flight_keys?: string[];
    nexus_query?: any;
    currency?: string;
    total_price?: number;
    
    // Hotel specific details
    hotelId?: string;
    hotelName?: string;
    checkIn?: string;
    checkOut?: string;
    roomType?: string;
    address?: string;
    guests?: number;
  };
  createdAt: Date;
}

const bookingSchema = new Schema<IBooking>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bookingId: { type: String, required: true, unique: true },
    type: { type: String, enum: ['FLIGHT', 'HOTEL', 'PACKAGE', 'BUS'], required: true },
    status: { type: String, enum: ['INITIATED', 'PAYMENT_PENDING', 'TICKETING_IN_PROGRESS', 'CONFIRMED', 'FAILED_REFUNDING', 'FAILED', 'CANCELLED'], default: 'INITIATED' },
    idempotencyKey: { type: String, sparse: true, unique: true },
    bookingMode: { type: String, enum: ['PERSONAL', 'MYBIZ'], default: 'PERSONAL' },
    paymentMethod: { type: String, enum: ['RAZORPAY', 'WALLET'], default: 'RAZORPAY' },
    totalAmount: { type: Number, required: true },
    promoCodeApplied: { type: String, default: null },
    discountAmount: { type: Number, default: 0 },
    date: { type: String, required: true },
    
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },

    cancellationReason: { type: String },
    cancelledAt: { type: Date },
    refundStatus: { type: String, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'NONE'], default: 'NONE' },
    refundAmount: { type: Number },

    details: {
      airline: String,
      from: String,
      to: String,
      destination: String,
      passengers: [{ 
        name: String, 
        gender: String, 
        type: { type: String },
        dob: String,
        passportNum: String,
        passportExpiry: String,
        nationality: String
      }],
      contactDetails: { email: String, phone: String, countryCode: String },
      seats: [String],
      flightId: { type: Schema.Types.ObjectId, ref: 'Flight' },
      pnr: String,
      nexus_response: Schema.Types.Mixed,
      api_error: String,
      flight_keys: Array,
      nexus_query: Schema.Types.Mixed,
      currency: String,
      total_price: Number,
      
      // Hotel Specific
      hotelId: String,
      hotelName: String,
      checkIn: String,
      checkOut: String,
      roomType: String,
      address: String,
      guests: Number,
    },
  },
  {
    timestamps: true,
  }
);

bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ type: 1 });
bookingSchema.index({ 'details.pnr': 1 });
bookingSchema.index({ 'details.flight_keys': 1 });
bookingSchema.index({ createdAt: -1 });

const Booking = mongoose.model<IBooking>('Booking', bookingSchema);
export default Booking;
