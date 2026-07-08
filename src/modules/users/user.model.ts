import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser } from '../../interfaces/user.interface';

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['SUPER_ADMIN', 'SUB_ADMIN', 'AGENT', 'USER'],
      default: 'USER',
    },
    department: {
      type: String,
      enum: ['Sales', 'Operations', 'Customer Support', 'Accounts', null],
      default: null,
    },
    companyName: {
      type: String,
    },
    avatar: {
      type: String,
      default: '',
    },
    firstName: { type: String },
    lastName: { type: String },
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    nationality: { type: String },
    dob: { type: Date },
    passportNumber: { type: String },
    passportExpiry: { type: Date },
    issuingCountry: { type: String },
    panNumber: { type: String },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    savedTravellers: [
      {
        firstName: { type: String, required: true },
        lastName: { type: String, required: true },
        dob: { type: Date, required: true },
        gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
        passportNumber: { type: String },
      },
    ],
    walletBalance: {
      type: Number,
      default: 0,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  {
    timestamps: true,
  }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password as string, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword: string) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model<IUser>('User', userSchema);
export default User;
