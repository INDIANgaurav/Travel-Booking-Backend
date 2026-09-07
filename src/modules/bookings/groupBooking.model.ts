import mongoose, { Schema, Document } from 'mongoose';

export interface IPassenger {
  title?: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  dob?: string;
  passportNum?: string;
  passportExpiry?: string;
  type?: string;
}

export interface IGroupBooking extends Document {
  agentId: mongoose.Types.ObjectId;
  flightDetails: {
    origin: string;
    destination: string;
    onwardDate: string;
    classOnward: string;
    airlineCode?: string;
    flightCode?: string;
    bookingType: string;
    travelType: string;
  };
  requestedSeats: {
    adults: number;
    child: number;
    infants: number;
    total: number;
  };
  status: 'PENDING' | 'QUOTED' | 'PAID' | 'COMPLETED' | 'REJECTED';
  adminQuotePrice?: number;
  totalPaidAmount?: number;
  passengers: IPassenger[];
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const groupBookingSchema = new Schema<IGroupBooking>(
  {
    agentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    flightDetails: {
      origin: { type: String, required: true },
      destination: { type: String, required: true },
      onwardDate: { type: String, required: true },
      classOnward: { type: String, required: true },
      airlineCode: { type: String },
      flightCode: { type: String },
      bookingType: { type: String, required: true },
      travelType: { type: String, required: true }
    },
    requestedSeats: {
      adults: { type: Number, required: true, default: 1 },
      child: { type: Number, required: true, default: 0 },
      infants: { type: Number, required: true, default: 0 },
      total: { type: Number, required: true }
    },
    status: { 
      type: String, 
      enum: ['PENDING', 'QUOTED', 'PAID', 'COMPLETED', 'REJECTED'], 
      default: 'PENDING' 
    },
    adminQuotePrice: { type: Number },
    totalPaidAmount: { type: Number },
    passengers: [{
      title: String,
      firstName: String,
      lastName: String,
      gender: String,
      dob: String,
      passportNum: String,
      passportExpiry: String,
      type: String
    }],
    remarks: { type: String }
  },
  { timestamps: true }
);

const GroupBooking = mongoose.model<IGroupBooking>('GroupBooking', groupBookingSchema);

export default GroupBooking;
