import mongoose, { Schema, Document } from 'mongoose';

export interface IBooking extends Document {
  user: mongoose.Types.ObjectId;
  bookingId: string;
  type: 'FLIGHT' | 'HOTEL' | 'PACKAGE' | 'BUS';
  status: 'CONFIRMED' | 'PENDING' | 'CANCELLED';
  totalAmount: number;
  date: string;
  
  // Razorpay Fields
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;

  details: {
    airline?: string;
    from?: string;
    to?: string;
    destination?: string;
    passengers?: Array<{ name: string; gender: string; type: string }>;
    contactDetails?: { email: string; phone: string; countryCode: string };
    seats?: string[];
    flightId?: mongoose.Types.ObjectId;
  };
  createdAt: Date;
}

const bookingSchema = new Schema<IBooking>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bookingId: { type: String, required: true, unique: true },
    type: { type: String, enum: ['FLIGHT', 'HOTEL', 'PACKAGE', 'BUS'], required: true },
    status: { type: String, enum: ['CONFIRMED', 'PENDING', 'CANCELLED'], default: 'PENDING' },
    totalAmount: { type: Number, required: true },
    date: { type: String, required: true },
    
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },

    details: {
      airline: String,
      from: String,
      to: String,
      destination: String,
      passengers: [{ 
        name: String, 
        gender: String, 
        passengerType: String 
      }],
      contactDetails: { email: String, phone: String, countryCode: String },
      seats: [String],
      flightId: { type: Schema.Types.ObjectId, ref: 'Flight' },
    },
  },
  {
    timestamps: true,
  }
);

const Booking = mongoose.model<IBooking>('Booking', bookingSchema);
export default Booking;
