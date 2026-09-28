import mongoose, { Schema, Document } from "mongoose";

export interface IWFHAssignment extends Document {
    userId: mongoose.Types.ObjectId;
    assignedBy: mongoose.Types.ObjectId;
    startDate: Date;
    endDate: Date;
    reason?: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const WFHAssignmentSchema = new Schema<IWFHAssignment>(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        reason: String,
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

// Indexes
WFHAssignmentSchema.index({ userId: 1 });
WFHAssignmentSchema.index({ startDate: 1, endDate: 1 });

export default mongoose.model<IWFHAssignment>("WFHAssignment", WFHAssignmentSchema);
