import mongoose, { Schema, Document } from "mongoose";

export enum LeaveType {
  SICK = "SICK",
  CASUAL = "CASUAL",
  VACATION = "VACATION",
  WORK_FROM_HOME = "WORK_FROM_HOME",
  UNPAID = "UNPAID",
}

export enum LeaveStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  CANCELLED = "CANCELLED",
}

import { IUser } from "./User";

export interface ILeave extends Document {
  userId: mongoose.Types.ObjectId;
  user?: IUser;
  leaveType: LeaveType;
  startDate: Date;
  endDate: Date;
  days: number;
  isHalfDay: boolean;
  reason: string;
  status: LeaveStatus;
  approvedBy?: mongoose.Types.ObjectId;
  approver?: IUser;
  approvedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LeaveSchema = new Schema<ILeave>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    leaveType: { type: String, enum: Object.values(LeaveType), required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, required: true },
    isHalfDay: { type: Boolean, default: false },
    reason: { type: String, required: true },
    status: { type: String, enum: Object.values(LeaveStatus), default: LeaveStatus.PENDING },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
    rejectionReason: String,
  },
  { timestamps: true }
);

// Virtuals
LeaveSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

LeaveSchema.virtual("approver", {
  ref: "User",
  localField: "approvedBy",
  foreignField: "_id",
  justOne: true,
});

// Configure JSON output to include virtuals
LeaveSchema.set("toJSON", { virtuals: true });
LeaveSchema.set("toObject", { virtuals: true });

// Indexes
LeaveSchema.index({ userId: 1 });
LeaveSchema.index({ status: 1 });
LeaveSchema.index({ startDate: 1 });

export default mongoose.model<ILeave>("Leave", LeaveSchema);
