import mongoose, { Schema, Document } from "mongoose";

export enum CorrectionStatus {
    PENDING = "PENDING",
    APPROVED = "APPROVED",
    REJECTED = "REJECTED",
}

export interface IAttendanceCorrection extends Document {
    userId: mongoose.Types.ObjectId;
    attendanceId?: mongoose.Types.ObjectId; // Optional if correction is for a missing record
    date: Date;
    requestedPunchIn?: Date;
    requestedPunchOut?: Date;
    reason: string;
    status: CorrectionStatus;
    approverId?: mongoose.Types.ObjectId;
    adminNotes?: string;
    createdAt: Date;
    updatedAt: Date;
}

const AttendanceCorrectionSchema = new Schema<IAttendanceCorrection>(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        attendanceId: { type: Schema.Types.ObjectId, ref: "Attendance" },
        date: { type: Date, required: true },
        requestedPunchIn: Date,
        requestedPunchOut: Date,
        reason: { type: String, required: true },
        status: {
            type: String,
            enum: Object.values(CorrectionStatus),
            default: CorrectionStatus.PENDING,
        },
        approverId: { type: Schema.Types.ObjectId, ref: "User" },
        adminNotes: String,
    },
    { timestamps: true }
);

// Indexes
AttendanceCorrectionSchema.index({ userId: 1 });
AttendanceCorrectionSchema.index({ status: 1 });
AttendanceCorrectionSchema.index({ date: 1 });

export default mongoose.model<IAttendanceCorrection>(
    "AttendanceCorrection",
    AttendanceCorrectionSchema
);
