import mongoose, { Document, Schema } from 'mongoose';

export interface IAuthRateLimit extends Document {
  key: string;
  count: number;
  resetAt: Date;
}

const authRateLimitSchema = new Schema<IAuthRateLimit>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },
    count: {
      type: Number,
      required: true,
      default: 0,
    },
    resetAt: {
      type: Date,
      required: true,
      expires: 0,
    },
  },
  {
    timestamps: false,
  }
);

const AuthRateLimit = mongoose.model<IAuthRateLimit>('AuthRateLimit', authRateLimitSchema);
export default AuthRateLimit;

