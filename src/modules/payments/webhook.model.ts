import mongoose, { Schema, Document } from 'mongoose';

export interface IWebhookLog extends Document {
  eventId: string;
  eventType: string;
  status: 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'IGNORED';
  payload: any;
  error?: string;
  processedAt: Date;
  updatedAt: Date;
}

const webhookLogSchema = new Schema<IWebhookLog>(
  {
    eventId: { type: String, required: true, unique: true },
    eventType: { type: String, required: true },
    status: { type: String, enum: ['PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED'], default: 'PROCESSING' },
    payload: { type: Schema.Types.Mixed },
    error: { type: String },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

webhookLogSchema.index({ eventId: 1 }, { unique: true });
webhookLogSchema.index({ eventType: 1 });
webhookLogSchema.index({ createdAt: -1 });

export default mongoose.model<IWebhookLog>('WebhookLog', webhookLogSchema);

