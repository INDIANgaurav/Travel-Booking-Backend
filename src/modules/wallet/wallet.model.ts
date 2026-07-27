import mongoose, { Schema, Document } from 'mongoose';

export interface ITransaction extends Document {
  user: mongoose.Types.ObjectId;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  description: string;
  paymentMethod: string;
  date: Date;
  
  // Account Ledger Specific Fields
  referenceNo?: string;
  pnr?: string;
  productName?: string;
  passengerName?: string;
  grossAmount?: number;
  markup?: number;
  commission?: number;
  tds?: number;
  sgst?: number;
  cgst?: number;
  igst?: number;
  penalty?: number;
  promoAmount?: number;
  netAmountDebited?: number;
}

const transactionSchema = new Schema<ITransaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    paymentMethod: { type: String, default: 'UPI' },
    date: { type: Date, default: Date.now },
    
    // Account Ledger Specific Fields
    referenceNo: { type: String },
    pnr: { type: String },
    productName: { type: String },
    passengerName: { type: String },
    grossAmount: { type: Number, default: 0 },
    markup: { type: Number, default: 0 },
    commission: { type: Number, default: 0 },
    tds: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    penalty: { type: Number, default: 0 },
    promoAmount: { type: Number, default: 0 },
    netAmountDebited: { type: Number, default: 0 },
  }
);

const Transaction = mongoose.model<ITransaction>('Transaction', transactionSchema);
export default Transaction;
