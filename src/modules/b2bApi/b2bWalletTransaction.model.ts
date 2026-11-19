import mongoose, { Document, Schema } from 'mongoose';

export type B2BWalletTxType = 'CREDIT' | 'DEBIT' | 'REFUND' | 'REVERSAL' | 'ADJUSTMENT';

export interface IB2BWalletTransaction extends Document {
  partnerId: mongoose.Types.ObjectId;
  bookingId?: string;
  bookingRef?: mongoose.Types.ObjectId;
  transactionType: B2BWalletTxType;
  amount: number;
  currency: string;
  balanceBefore: number;
  balanceAfter: number;
  referenceId: string;
  description: string;
  performedBy?: mongoose.Types.ObjectId;
  status: 'POSTED' | 'REVERSED';
  createdAt: Date;
}

const b2bWalletTransactionSchema = new Schema<IB2BWalletTransaction>(
  {
    partnerId: { type: Schema.Types.ObjectId, ref: 'B2BClient', required: true, index: true },
    bookingId: { type: String, index: true },
    bookingRef: { type: Schema.Types.ObjectId, ref: 'Booking' },
    transactionType: {
      type: String,
      enum: ['CREDIT', 'DEBIT', 'REFUND', 'REVERSAL', 'ADJUSTMENT'],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR', required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    referenceId: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['POSTED', 'REVERSED'], default: 'POSTED', required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

b2bWalletTransactionSchema.index({ partnerId: 1, createdAt: -1 });

const B2BWalletTransaction = mongoose.model<IB2BWalletTransaction>('B2BWalletTransaction', b2bWalletTransactionSchema);
export default B2BWalletTransaction;

