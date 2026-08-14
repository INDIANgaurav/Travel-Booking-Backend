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
      // optional for OAuth
    },
    password: {
      type: String,
      // optional for OAuth
    },
    role: {
      type: String,
      enum: ['SUPER_ADMIN', 'SUB_ADMIN', 'B2B_AGENT', 'SUPPLIER_AGENT', 'SUPPLIER_STAFF', 'USER'],
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
    companyRole: { type: String },
    supplierOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    employeeSize: { type: String },
    gstn: { type: String },
    agentStatus: {
      type: String,
      enum: ['PENDING', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'INCOMPLETE'],
      default: 'INCOMPLETE'
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
    officeAddress: { type: String },
    state: { type: String },
    city: { type: String },
    pincode: { type: String },
    panCardImage: { type: String },
    idProofType: { type: String },
    idProofImage: { type: String },
    gstImage: { type: String },
    remarks: { type: String },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
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

userSchema.index({ role: 1 });
userSchema.index({ agentStatus: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ supplierOwnerId: 1 });

userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password as string, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword: string) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model<IUser>('User', userSchema);
export default User;
