import mongoose, { Document, Schema } from 'mongoose';

// 1. Service Provider
export interface IServiceProvider extends Document {
  type: 'SMS' | 'EMAIL';
  name: string;
  url: string;
  apiKey?: string;
  isActive: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPassword?: string;
  assignedUsers: mongoose.Types.ObjectId[];
}

const serviceProviderSchema = new Schema<IServiceProvider>({
  type: { type: String, enum: ['SMS', 'EMAIL'], required: true },
  name: { type: String, required: true },
  url: { type: String, required: true },
  apiKey: { type: String },
  isActive: { type: Boolean, default: false },
  smtpHost: { type: String },
  smtpPort: { type: Number },
  smtpUsername: { type: String },
  smtpPassword: { type: String },
  assignedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

// 2. Role Master
export interface IRoleMaster extends Document {
  roleCode: string;
  roleDesc: string;
  isDefault: boolean;
  createdBy: mongoose.Types.ObjectId;
}

const roleMasterSchema = new Schema<IRoleMaster>({
  roleCode: { type: String, required: true, unique: true },
  roleDesc: { type: String, required: true },
  isDefault: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// 3. PG Mapping
export interface IPGMapping extends Document {
  user: mongoose.Types.ObjectId;
  gatewayName: string;
  mode: string;
  chargeType: 'PERCENTAGE' | 'FLAT';
  chargeValue: number;
}

const pgMappingSchema = new Schema<IPGMapping>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  gatewayName: { type: String, required: true },
  mode: { type: String, required: true },
  chargeType: { type: String, enum: ['PERCENTAGE', 'FLAT'], required: true },
  chargeValue: { type: Number, required: true }
}, { timestamps: true });

// 4. Dynamic Pages (CMS)
export interface IDynamicPage extends Document {
  pageName: string;
  headline: string;
  content: string;
}

const dynamicPageSchema = new Schema<IDynamicPage>({
  pageName: { type: String, required: true, unique: true },
  headline: { type: String, required: true },
  content: { type: String, required: true }
}, { timestamps: true });

export const ServiceProvider = mongoose.model<IServiceProvider>('ServiceProvider', serviceProviderSchema);
export const RoleMaster = mongoose.model<IRoleMaster>('RoleMaster', roleMasterSchema);
export const PGMapping = mongoose.model<IPGMapping>('PGMapping', pgMappingSchema);
export const DynamicPage = mongoose.model<IDynamicPage>('DynamicPage', dynamicPageSchema);
