import mongoose, { Schema, Document } from 'mongoose';

export interface ISupplier extends Document {
  name: string;
  type: 'API' | 'MANUAL';
  balance: number;
  creditLimit: number;
  apiConfig?: {
    endpoint?: string;
    apiKey?: string;
    secretKey?: string;
  };
  commission: {
    percentage: number;
    fixedAmount: number;
  };
  isActive: boolean;
  carrier?: string;
  searchEnabled?: boolean;
  issuanceEnabled?: boolean;
  inventoryType?: string;
  category?: string;
  keyType?: string;
  cugEnabled?: boolean;
  
  // New Fields
  supplierId?: string;
  fullName?: string;
  flightTypes?: {
    oneWay: boolean;
    roundTrip: boolean;
    multiCity: boolean;
  };
  searchByAirlines?: boolean;
  onlyHolidayPackage?: boolean;
  vendorCode1?: string;
  vendorCode2?: string;
  onGross?: boolean;
  domestic?: boolean;
  international?: boolean;
  creditLocked?: boolean;
  sectorDateCheck?: boolean;
  availableSector?: string;
  fareIdentifier?: string;
  fareType?: string;
  bookingPending?: boolean;
  bookingPendingMessage?: string;
  mfs?: boolean;
  restrictAirlines?: string;
  restrictUptoDate?: Date;
  externalSupp?: boolean;
  
  // Sub-schema
  credentials: Array<{
    vendorId?: string;
    key: string;
    value: string;
  }>;

  createdAt: Date;
  updatedAt: Date;
}

const supplierSchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    type: { type: String, enum: ['API', 'MANUAL'], required: true },
    balance: { type: Number, default: 0 },
    creditLimit: { type: Number, default: 0 },
    apiConfig: {
      endpoint: { type: String },
      apiKey: { type: String },
      secretKey: { type: String },
    },
    commission: {
      percentage: { type: Number, default: 0 },
      fixedAmount: { type: Number, default: 0 },
    },
    isActive: { type: Boolean, default: true },
    carrier: { type: String, default: 'ANY' },
    searchEnabled: { type: Boolean, default: true },
    issuanceEnabled: { type: Boolean, default: false },
    inventoryType: { type: String, enum: ['D/I', 'DOMESTIC', 'INTERNATIONAL'], default: 'D/I' },
    category: { type: String, enum: ['FLIGHT', 'HOTEL', 'HOLIDAY'], default: 'FLIGHT' },
    keyType: { type: String, enum: ['SERIES', 'OFFLINE', 'API'], default: 'SERIES' },
    cugEnabled: { type: Boolean, default: false },
    
    // New Fields
    supplierId: { type: String },
    fullName: { type: String },
    flightTypes: {
      oneWay: { type: Boolean, default: true },
      roundTrip: { type: Boolean, default: true },
      multiCity: { type: Boolean, default: false },
    },
    searchByAirlines: { type: Boolean, default: false },
    onlyHolidayPackage: { type: Boolean, default: false },
    vendorCode1: { type: String },
    vendorCode2: { type: String },
    onGross: { type: Boolean, default: false },
    domestic: { type: Boolean, default: true },
    international: { type: Boolean, default: true },
    creditLocked: { type: Boolean, default: false },
    sectorDateCheck: { type: Boolean, default: false },
    availableSector: { type: String },
    fareIdentifier: { type: String },
    fareType: { type: String },
    bookingPending: { type: Boolean, default: false },
    bookingPendingMessage: { type: String },
    mfs: { type: Boolean, default: false },
    restrictAirlines: { type: String },
    restrictUptoDate: { type: Date },
    externalSupp: { type: Boolean, default: false },
    
    // Sub-schema
    credentials: [{
      vendorId: { type: String },
      key: { type: String, required: true },
      value: { type: String, required: true }
    }],
  },
  { timestamps: true }
);

export default mongoose.model<ISupplier>('Supplier', supplierSchema);
