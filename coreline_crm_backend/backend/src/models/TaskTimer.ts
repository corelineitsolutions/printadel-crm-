import mongoose, { Schema, Document } from "mongoose";

export interface ITaskTimer extends Document {
  taskId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  startTime: Date;
  endTime?: Date;
  pauseStartTime?: Date;
  pauseDuration: number;
  durationSeconds?: number;
  notes?: string;
  createdAt: Date;
}

const TaskTimerSchema = new Schema<ITaskTimer>({
  taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  startTime: { type: Date, default: Date.now },
  endTime: Date,
  pauseStartTime: Date,
  pauseDuration: { type: Number, default: 0 },
  durationSeconds: Number,
  notes: String,
  createdAt: { type: Date, default: Date.now },
});

// Indexes
TaskTimerSchema.index({ taskId: 1 });
TaskTimerSchema.index({ userId: 1 });
TaskTimerSchema.index({ startTime: 1 });

export default mongoose.model<ITaskTimer>("TaskTimer", TaskTimerSchema);
