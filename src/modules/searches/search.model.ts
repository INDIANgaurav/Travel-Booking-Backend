import mongoose, { Schema, Document } from 'mongoose';

export interface IRecentSearch extends Document {
  user: mongoose.Types.ObjectId;
  type: 'FLIGHT' | 'HOTEL' | 'PACKAGE' | 'BUS';
  from?: { code: string; city: string };
  to?: { code: string; city: string };
  destination?: string;
  date: string;
  travelers: number;
  createdAt: Date;
}

const recentSearchSchema = new Schema<IRecentSearch>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['FLIGHT', 'HOTEL', 'PACKAGE', 'BUS'], required: true },
    from: {
      code: String,
      city: String,
    },
    to: {
      code: String,
      city: String,
    },
    destination: String,
    date: { type: String, required: true },
    travelers: { type: Number, default: 1 },
  },
  {
    timestamps: true,
  }
);

const RecentSearch = mongoose.model<IRecentSearch>('RecentSearch', recentSearchSchema);
export default RecentSearch;
