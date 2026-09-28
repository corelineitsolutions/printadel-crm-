import mongoose, { Schema, Document } from "mongoose";

export interface ILeaveBalance extends Document {
  userId: mongoose.Types.ObjectId;
  year: number;
  sickLeave: number;
  casualLeave: number;
  paidLeave: number;
  vacationLeave: number;
  sickLeaveUsed: number;
  casualLeaveUsed: number;
  vacationLeaveUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

const LeaveBalanceSchema = new Schema<ILeaveBalance>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    year: { type: Number, required: true },
    sickLeave: { type: Number, default: 12 },
    casualLeave: { type: Number, default: 10 },
    paidLeave: { type: Number, default: 18 },
    vacationLeave: { type: Number, default: 15 },
    sickLeaveUsed: { type: Number, default: 0 },
    casualLeaveUsed: { type: Number, default: 0 },
    vacationLeaveUsed: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Indexes
// compound index solves year rollover (userId is no longer strictly unique)
LeaveBalanceSchema.index({ userId: 1, year: 1 }, { unique: true });
LeaveBalanceSchema.index({ year: 1 });

export default mongoose.model<ILeaveBalance>("LeaveBalance", LeaveBalanceSchema);
