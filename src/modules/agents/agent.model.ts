import mongoose, { Schema } from 'mongoose';
import { IAgentProfile } from '../../interfaces/agent.interface';

const agentProfileSchema = new Schema<IAgentProfile>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    gstNumber: {
      type: String,
    },
    panNumber: {
      type: String,
    },
    agencyName: {
      type: String,
      required: true,
    },
    walletBalance: {
      type: Number,
      default: 0,
    },
    creditLimit: {
      type: Number,
      default: 0,
    },
    commissionPercentage: {
      type: Number,
      default: 0, // Usually set by admin
    },
  },
  {
    timestamps: true,
  }
);

const AgentProfile = mongoose.model<IAgentProfile>('AgentProfile', agentProfileSchema);
export default AgentProfile;
