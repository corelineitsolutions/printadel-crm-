import mongoose, { Schema, Document } from "mongoose";

export const PRINTING_ACTIVITIES = [
  "Printing",
  "Design / Pre-press",
  "Cutting & Finishing",
  "Binding",
  "Packaging",
  "Delivery / Dispatch",
  "Machine Maintenance",
  "Help / Support",
  "Other",
] as const;

export type PrintingActivityType = typeof PRINTING_ACTIVITIES[number];

export const HELP_SUPPORT_ACTIVITY = "Help / Support";
export const MAX_HELP_SUPPORT_PER_LOGOUT = 2;

export interface IProductivityLog extends Document {
  userId: mongoose.Types.ObjectId;
  jobCardId?: mongoose.Types.ObjectId;
  activityType: string;
  durationMinutes: number;
  hoursSpent: number;
  notes?: string;
  timestamp: Date;
  isLogoutSession: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProductivityLogSchema = new Schema<IProductivityLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    jobCardId: { type: Schema.Types.ObjectId, ref: "JobCard" },
    activityType: { type: String, required: true },
    durationMinutes: { type: Number, required: true, default: 60 },
    hoursSpent: { type: Number, required: true, default: 1 },
    notes: String,
    timestamp: { type: Date, default: Date.now },
    isLogoutSession: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Indexes
ProductivityLogSchema.index({ userId: 1, timestamp: -1 });
ProductivityLogSchema.index({ jobCardId: 1 });
ProductivityLogSchema.index({ activityType: 1 });
ProductivityLogSchema.index({ timestamp: -1 });

export default mongoose.model<IProductivityLog>("ProductivityLog", ProductivityLogSchema);
