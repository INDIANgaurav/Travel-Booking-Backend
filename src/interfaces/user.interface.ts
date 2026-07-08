import { Document } from 'mongoose';

export type Role = 'SUPER_ADMIN' | 'SUB_ADMIN' | 'AGENT' | 'USER';
export type Department = 'Sales' | 'Operations' | 'Customer Support' | 'Accounts' | null;

export interface IUser extends Document {
  name: string;
  email: string;
  phone: string;
  password?: string;
  role: Role;
  department?: Department;
  companyName?: string | null;
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
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  savedTravellers: {
    firstName: string;
    lastName: string;
    dob: Date;
    gender: 'Male' | 'Female' | 'Other';
    passportNumber?: string;
  }[];
  walletBalance: number;
  isApproved: boolean;
  matchPassword(enteredPassword: string): Promise<boolean>;
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
  createdAt: Date;
  updatedAt: Date;
}
