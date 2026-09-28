import mongoose, { Schema, Document } from "mongoose";

export enum JobCardStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  PRINTING = "PRINTING",
  QUALITY_CHECK = "QUALITY_CHECK",
  READY_FOR_DELIVERY = "READY_FOR_DELIVERY",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum JobCardPriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

export interface IJobCardStatusHistory {
  status: JobCardStatus;
  changedBy: mongoose.Types.ObjectId;
  changedAt: Date;
  note?: string;
}

export interface IJobCard extends Document {
  jobCardNumber: string;
  orderNumber?: string;
  title: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  description?: string;
  specifications?: string;
  paperStock?: string;
  size?: string;
  quantity?: number;
  finish?: string;
  priority: JobCardPriority;
  status: JobCardStatus;
  assignedTo: mongoose.Types.ObjectId[];
  assignedBy: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  targetDeliveryDate?: Date;
  estimatedHours?: number;
  actualHours?: number;
  attachments?: string[];
  statusHistory: IJobCardStatusHistory[];
  createdAt: Date;
  updatedAt: Date;
}

const JobCardSchema = new Schema<IJobCard>(
  {
    jobCardNumber: { type: String, required: true, unique: true },
    orderNumber: String,
    title: { type: String, required: true },
    clientName: { type: String, required: true },
    clientPhone: String,
    clientEmail: String,
    description: String,
    specifications: String,
    paperStock: String,
    size: String,
    quantity: { type: Number, default: 1 },
    finish: String,
    priority: { type: String, enum: Object.values(JobCardPriority), default: JobCardPriority.MEDIUM },
    status: { type: String, enum: Object.values(JobCardStatus), default: JobCardStatus.PENDING },
    assignedTo: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    targetDeliveryDate: Date,
    estimatedHours: { type: Number, default: 0 },
    actualHours: { type: Number, default: 0 },
    attachments: { type: [String], default: [] },
    statusHistory: [
      {
        status: { type: String, enum: Object.values(JobCardStatus), required: true },
        changedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        changedAt: { type: Date, default: Date.now },
        note: String,
      },
    ],
  },
  { timestamps: true }
);

// Indexes for fast lookup & filtering
JobCardSchema.index({ status: 1 });
JobCardSchema.index({ priority: 1 });
JobCardSchema.index({ assignedTo: 1 });
JobCardSchema.index({ assignedBy: 1 });
JobCardSchema.index({ projectId: 1 });
JobCardSchema.index({ targetDeliveryDate: 1 });
JobCardSchema.index({ createdAt: -1 });

export default mongoose.model<IJobCard>("JobCard", JobCardSchema);
