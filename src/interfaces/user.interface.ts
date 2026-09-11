import { Document } from 'mongoose';

export type Role = 'SUPER_ADMIN' | 'SUB_ADMIN' | 'B2B_AGENT' | 'SUPPLIER_AGENT' | 'SUPPLIER_STAFF' | 'USER' | string;
export type Department = 'Sales' | 'Operations' | 'Customer Support' | 'Accounts' | null;

export interface IUser extends Document {
  name: string;
  email: string;
  phone?: string;
  password?: string;
  roles: Role[];
  department?: Department;
  companyName?: string | null;
  companyRole?: string;
  supplierOwnerId?: string;
  employeeSize?: string;
  gstn?: string;
  agentStatus?: 'PENDING' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'INCOMPLETE';
  avatar?: string;
  firstName?: string;
  lastName?: string;
  gender?: 'Male' | 'Female' | 'Other';
  nationality?: string;
  dob?: Date;
  passportNumber?: string;
  passportExpiry?: Date;
  issuingCountry?: string;
  panNumber?: string;
  officeAddress?: string;
  state?: string;
  city?: string;
  pincode?: string;
  panCardImage?: string;
  idProofType?: string;
  idProofImage?: string;
  gstImage?: string;
  remarks?: string;
  isEmailVerified?: boolean;
  isActive: boolean;
  isPhoneVerified?: boolean;
  savedTravellers: {
    firstName: string;
    lastName: string;
    dob: Date;
    gender: 'Male' | 'Female' | 'Other';
    passportNumber?: string;
  }[];
  walletBalance: number;
  creditBalance: number;
  isApproved: boolean;
  resultExpiryTime?: number;
  otpTime?: number;
  requiredTravelDate?: boolean;
  extendedDomain?: string;
  irctcAgentId?: string;
  displayOnProfileIcon?: 'Company Name' | 'User Name' | 'Show Both';
  referredBy?: string;
  reportingTo?: string;
  // --- New Company Fields ---
  services?: string;
  businessType?: string;
  iataCode?: string;
  contactRepresentative?: string;
  nameOnPan?: string;
  commGrp?: string;
  marqueesDetail?: string;
  negoMarqueesDetail?: string;
  salesContactNo?: string;
  website?: string;
  officePhone?: string;
  country?: string;
  isVerified?: boolean;
  isOwner?: boolean;
  isLoginUser?: boolean;
  youtubeUrl?: string;
  linkedinUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  gstEnabled?: boolean;
  gstCompanyName?: string;
  gstCompanyAddress?: string;
  gstEmail?: string;
  gstContactNo?: string;
  cugPlatformSellingCharge?: number;
  cugPlatformBuyingCharge?: number;
  
  // --- New Document Fields ---
  documents?: {
    docName: string;
    docType: string;
    url: string;
    uploadedAt: Date;
  }[];
  isApprovedDocument?: boolean;

  matchPassword(enteredPassword: string): Promise<boolean>;
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
  otp?: string;
  otpExpiry?: Date;
  createdAt: Date;
  updatedAt: Date;
}
