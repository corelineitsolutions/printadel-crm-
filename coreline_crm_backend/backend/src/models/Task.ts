import mongoose, { Schema, Document } from "mongoose";

export enum TaskStatus {
  TO_DO = "TO_DO",
  IN_PROGRESS = "IN_PROGRESS",
  UNDER_REVIEW = "UNDER_REVIEW",
  COMPLETED = "COMPLETED",
  REJECTED = "REJECTED",
}

export enum TaskPriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

export interface ITask extends Document {
  title: string;
  description?: string;
  projectId?: mongoose.Types.ObjectId;
  milestoneId?: mongoose.Types.ObjectId;
  assignedTo: mongoose.Types.ObjectId[]; // Changed to array for multiple assignees
  assignedBy: mongoose.Types.ObjectId;
  status: TaskStatus;
  priority: TaskPriority;
  estimatedHours?: number;
  actualHours?: number;
  deadline?: Date;
  isBlocked: boolean;
  blockerReason?: string;
  taskImages?: string[]; // Added for base64 images
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>(
  {
    title: { type: String, required: true },
    description: String,
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    milestoneId: { type: Schema.Types.ObjectId, ref: "Milestone" },
    assignedTo: [{ type: Schema.Types.ObjectId, ref: "User", required: true }], // Changed to array
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: Object.values(TaskStatus), default: TaskStatus.TO_DO },
    priority: { type: String, enum: Object.values(TaskPriority), default: TaskPriority.MEDIUM },
    estimatedHours: Number,
    actualHours: Number,
    deadline: Date,
    isBlocked: { type: Boolean, default: false },
    blockerReason: String,
    taskImages: { type: [String], default: [] }, // Added for base64 images
  },
  { timestamps: true }
);

// Indexes
TaskSchema.index({ assignedTo: 1 });
TaskSchema.index({ assignedBy: 1 });
TaskSchema.index({ projectId: 1 });
TaskSchema.index({ milestoneId: 1 });
TaskSchema.index({ status: 1 });
TaskSchema.index({ priority: 1 });

export default mongoose.model<ITask>("Task", TaskSchema);
