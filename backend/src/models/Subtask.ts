import mongoose, { Schema, Document } from "mongoose";

export interface ISubtask extends Document {
  taskId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  isCompleted: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SubtaskSchema = new Schema<ISubtask>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    title: { type: String, required: true },
    description: String,
    isCompleted: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Indexes
SubtaskSchema.index({ taskId: 1 });
SubtaskSchema.index({ createdBy: 1 });

export default mongoose.model<ISubtask>("Subtask", SubtaskSchema);
