import mongoose, { Schema, Document } from "mongoose";

export enum AttendanceStatus {
  PRESENT = "PRESENT",
  ABSENT = "ABSENT",
  LEAVE = "LEAVE",
  HALF_DAY = "HALF_DAY",
  WORK_FROM_HOME = "WORK_FROM_HOME",
  WEEKEND = "WEEKEND",
  HOLIDAY = "HOLIDAY",
}

export interface IAttendance extends Document {
  userId: mongoose.Types.ObjectId;
  date: Date;
  punchInTime?: Date;
  punchInLocation?: {
    lat: number;
    lng: number;
    address?: string;
  };
  punchOutTime?: Date;
  punchOutLocation?: {
    lat: number;
    lng: number;
    address?: string;
  };
  breaks: Array<{
    startTime: Date;
    endTime?: Date;
    durationMinutes?: number;
  }>;
  breakDuration: number; // Cumulative duration in minutes
  totalHours?: number;
  workingHours?: number;
  isLate?: boolean;
  lateMinutes?: number;
  isWFH: boolean;
  isOvertime: boolean;
  overtimeHours: number;
  status: AttendanceStatus;
  workSummary: string;
  workImages?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSchema = new Schema<IAttendance>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, default: Date.now },
    punchInTime: Date,
    punchInLocation: {
      lat: Number,
      lng: Number,
      address: String,
    },
    punchOutTime: Date,
    punchOutLocation: {
      lat: Number,
      lng: Number,
      address: String,
    },
    breaks: [
      {
        startTime: Date,
        endTime: Date,
        durationMinutes: Number,
      },
    ],
    breakDuration: { type: Number, default: 0 },
    totalHours: Number,
    workingHours: Number,
    isLate: { type: Boolean, default: false },
    lateMinutes: { type: Number, default: 0 },
    isWFH: { type: Boolean, default: false },
    isOvertime: { type: Boolean, default: false },
    overtimeHours: { type: Number, default: 0 },
    status: { type: String, enum: Object.values(AttendanceStatus), default: AttendanceStatus.PRESENT },
    workSummary: String,
    workImages: { type: [String], default: [] },
  },
  { timestamps: true }
);

// Virtuals
AttendanceSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

// Configure JSON output to include virtuals
AttendanceSchema.set("toJSON", { virtuals: true });
AttendanceSchema.set("toObject", { virtuals: true });

// Indexes
AttendanceSchema.index({ userId: 1, date: 1 }, { unique: true });
AttendanceSchema.index({ userId: 1 });
AttendanceSchema.index({ date: 1 });
AttendanceSchema.index({ status: 1 });

export default mongoose.model<IAttendance>("Attendance", AttendanceSchema);
