import mongoose, { Schema, Document } from 'mongoose';

export interface IBooking extends Document {
  user: mongoose.Types.ObjectId;
  bookingId: string;
  type: 'FLIGHT' | 'HOTEL' | 'PACKAGE' | 'BUS';
  status: 'CONFIRMED' | 'PENDING' | 'CANCELLED';
  totalAmount: number;
  date: string;
  bookingMode: 'PERSONAL' | 'MYBIZ';
  
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;

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
    passengers?: Array<{ name: string; gender: string; type: string }>;
    contactDetails?: { email: string; phone: string; countryCode: string };
    seats?: string[];
    flightId?: mongoose.Types.ObjectId;
    pnr?: string;
    flight_keys?: string[];
    nexus_query?: any;
    
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
    status: { type: String, enum: ['CONFIRMED', 'PENDING', 'CANCELLED'], default: 'PENDING' },
    bookingMode: { type: String, enum: ['PERSONAL', 'MYBIZ'], default: 'PERSONAL' },
    totalAmount: { type: Number, required: true },
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
        type: { type: String }
      }],
      contactDetails: { email: String, phone: String, countryCode: String },
      seats: [String],
      flightId: { type: Schema.Types.ObjectId, ref: 'Flight' },
      pnr: { type: String },
      flight_keys: [String],
      nexus_query: Schema.Types.Mixed,
      
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

const Booking = mongoose.model<IBooking>('Booking', bookingSchema);
export default Booking;
