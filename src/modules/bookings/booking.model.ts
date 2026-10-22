import mongoose, { Schema, Document } from 'mongoose';

export interface IBooking extends Document {
  user: mongoose.Types.ObjectId;
  bookingId: string;
  type: 'FLIGHT' | 'HOTEL' | 'PACKAGE' | 'BUS';
  status: 'INITIATED' | 'PAYMENT_PENDING' | 'TICKETING_IN_PROGRESS' | 'CONFIRMED' | 'FAILED_REFUNDING' | 'FAILED' | 'CANCEL_PENDING' | 'PARTIALLY_CANCELLED' | 'CANCELLED';
  idempotencyKey?: string;
  totalAmount: number;
  date: string;
  isTestBooking?: boolean;
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
  cancellationPenalty?: number;
  platformFee?: number;

  details: {
    airline?: string;
    from?: string;
    to?: string;
    destination?: string;
    passengers?: Array<{ name: string; gender: string; type: string; dob?: string; passportNum?: string; passportExpiry?: string; nationality?: string; status?: 'CONFIRMED' | 'CANCEL_PENDING' | 'CANCELLED' }>;
    contactDetails?: { email: string; phone: string; countryCode: string };
    seats?: string[];
    flightId?: mongoose.Types.ObjectId;
    pnr?: string;
    isGapiFare?: boolean;
    isSeriesFare?: boolean;
    isAirIqFare?: boolean;
    resultSessionId?: string;
    searchSessionId?: string;
    txid?: string;
    gapi_response?: any;
    gapi_booking_details?: any;
    supplierId?: mongoose.Types.ObjectId;
    nexus_response?: any;
    api_error?: string;
    flight_keys?: string[];
    nexus_query?: any;
    currency?: string;
    total_price?: number;
    commission?: number;
    isSelfConsumption?: boolean;
    
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
    status: { type: String, enum: ['INITIATED', 'PAYMENT_PENDING', 'TICKETING_IN_PROGRESS', 'CONFIRMED', 'FAILED_REFUNDING', 'FAILED', 'CANCEL_PENDING', 'PARTIALLY_CANCELLED', 'CANCELLED'], default: 'INITIATED' },
    idempotencyKey: { type: String, sparse: true, unique: true },
    bookingMode: { type: String, enum: ['PERSONAL', 'MYBIZ'], default: 'PERSONAL' },
    isTestBooking: { type: Boolean, default: false, index: true },
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
    cancellationPenalty: { type: Number },
    platformFee: { type: Number },

    details: new Schema(
      {
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
          nationality: String,
          status: { type: String, enum: ['CONFIRMED', 'CANCEL_PENDING', 'CANCELLED'], default: 'CONFIRMED' }
        }],
        contactDetails: { email: String, phone: String, countryCode: String },
        seats: [String],
        flightId: { type: Schema.Types.ObjectId, ref: 'Flight' },
        pnr: String,
        isGapiFare: { type: Boolean, default: false },
        isSeriesFare: { type: Boolean, default: false },
        isAirIqFare: { type: Boolean, default: false },
        resultSessionId: String,
        searchSessionId: String,
        txid: String,
        gapi_response: Schema.Types.Mixed,
        gapi_booking_details: Schema.Types.Mixed,
        supplierId: { type: Schema.Types.ObjectId },
        nexus_response: Schema.Types.Mixed,
        api_error: String,
        flight_keys: Array,
        nexus_query: Schema.Types.Mixed,
        currency: String,
        total_price: Number,
        commission: { type: Number, default: 0 },
        
        // Hotel Specific
        hotelId: String,
        hotelName: String,
        checkIn: String,
        checkOut: String,
        roomType: String,
        address: String,
        guests: Number,
      },
      { _id: false, strict: false }
    ),
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
