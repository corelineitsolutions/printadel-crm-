import mongoose, { Schema, Document } from "mongoose";

export enum MilestoneStatus {
  NOT_STARTED = "NOT_STARTED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
}

export interface IMilestone extends Document {
  projectId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  dueDate?: Date;
  status: MilestoneStatus;
  createdAt: Date;
  updatedAt: Date;
}

const MilestoneSchema = new Schema<IMilestone>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    title: { type: String, required: true },
    description: String,
    dueDate: Date,
    status: { type: String, enum: Object.values(MilestoneStatus), default: MilestoneStatus.NOT_STARTED },
  },
  { timestamps: true }
);

// Indexes
MilestoneSchema.index({ projectId: 1 });
MilestoneSchema.index({ status: 1 });

export default mongoose.model<IMilestone>("Milestone", MilestoneSchema);
