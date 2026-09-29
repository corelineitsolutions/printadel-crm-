import mongoose, { Schema, Document } from "mongoose";

export enum NotificationType {
  LEAVE_REQUEST = "LEAVE_REQUEST",
  LEAVE_APPROVED = "LEAVE_APPROVED",
  LEAVE_REJECTED = "LEAVE_REJECTED",
  TASK_ASSIGNED = "TASK_ASSIGNED",
  TASK_COMPLETED = "TASK_COMPLETED",
  PAYROLL_GENERATED = "PAYROLL_GENERATED",
  ATTENDANCE_REMINDER = "ATTENDANCE_REMINDER",
  PROJECT_ASSIGNED = "PROJECT_ASSIGNED",
  MILESTONE_DUE = "MILESTONE_DUE",
  TASK_BLOCKED = "TASK_BLOCKED",
  TASK_UNBLOCKED = "TASK_UNBLOCKED",
  CORRECTION_REQUESTED = "CORRECTION_REQUESTED",
  CORRECTION_APPROVED = "CORRECTION_APPROVED",
  CORRECTION_REJECTED = "CORRECTION_REJECTED",
  WFH_ASSIGNED = "WFH_ASSIGNED",
  TASK_STATUS_UPDATED = "TASK_STATUS_UPDATED",
  TASK_DELETED = "TASK_DELETED",
  GENERAL = "GENERAL",
}

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  link?: string;
  metadata?: any;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: Object.values(NotificationType), required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  link: String,
  metadata: Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
});

// Virtuals
NotificationSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

// Configure JSON output to include virtuals
NotificationSchema.set("toJSON", { virtuals: true });
NotificationSchema.set("toObject", { virtuals: true });

// Indexes
NotificationSchema.index({ userId: 1 });
NotificationSchema.index({ isRead: 1 });
NotificationSchema.index({ createdAt: -1 });

// Auto-purge notifications after 90 days to maintain database performance
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model<INotification>("Notification", NotificationSchema);
