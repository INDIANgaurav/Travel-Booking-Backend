import mongoose, { Document, Schema } from 'mongoose';

export interface IPromoCode extends Document {
  code: string;
  description: string;
  discountType: 'FLAT' | 'PERCENTAGE';
  discountAmount: number;
  maxUses: number;
  usedCount: number;
  usageLimitPerUser: number;
  validFrom: Date;
  validTo: Date;
  isActive: boolean;
  applicableModules: ('FLIGHT' | 'HOTEL' | 'TOUR' | 'ALL')[];
  conditions: {
    origin?: string;
    destination?: string;
    travelDate?: Date;
    flightNumber?: string;
    pnr?: string;
    supplierId?: mongoose.Types.ObjectId;
  };
  createdAt: Date;
  updatedAt: Date;
}

const promoCodeSchema = new Schema<IPromoCode>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    discountType: { type: String, enum: ['FLAT', 'PERCENTAGE'], required: true, default: 'FLAT' },
    discountAmount: { type: Number, required: true },
    maxUses: { type: Number, default: 0 }, // 0 means unlimited globally
    usedCount: { type: Number, default: 0 },
    usageLimitPerUser: { type: Number, default: 1 }, // 0 means unlimited per user
    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    applicableModules: [{ type: String, enum: ['FLIGHT', 'HOTEL', 'TOUR', 'ALL'], default: 'FLIGHT' }],
    conditions: {
      origin: { type: String, uppercase: true },
      destination: { type: String, uppercase: true },
      travelDate: { type: Date },
      flightNumber: { type: String },
      pnr: { type: String, uppercase: true },
      supplierId: { type: Schema.Types.ObjectId, ref: 'User' },
    },
  },
  { timestamps: true }
);

// Indexes for faster lookup
promoCodeSchema.index({ code: 1, isActive: 1 });
promoCodeSchema.index({ validTo: 1 });

export default mongoose.model<IPromoCode>('PromoCode', promoCodeSchema);
