import mongoose, { Schema, Document } from "mongoose";

export enum ProjectStatus {
  PLANNING = "PLANNING",
  IN_PROGRESS = "IN_PROGRESS",
  ON_HOLD = "ON_HOLD",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export interface IProject extends Document {
  name: string;
  code: string;
  description?: string;
  requirements?: string;
  startDate?: Date;
  deadline?: Date;
  budget?: number;
  status: ProjectStatus;
  creator: mongoose.Types.ObjectId;
  clientName?: string;
  clientEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    description: String,
    requirements: String,
    startDate: Date,
    deadline: Date,
    budget: Number,
    status: { type: String, enum: Object.values(ProjectStatus), default: ProjectStatus.PLANNING },
    creator: { type: Schema.Types.ObjectId, ref: "User", required: true },
    clientName: String,
    clientEmail: String,
  },
  { timestamps: true }
);

// Indexes
ProjectSchema.index({ status: 1 });
ProjectSchema.index({ creator: 1 });

export default mongoose.model<IProject>("Project", ProjectSchema);
