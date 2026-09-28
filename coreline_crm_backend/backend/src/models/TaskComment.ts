import mongoose, { Schema, Document } from "mongoose";

export interface ITaskComment extends Document {
  taskId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  commentText: string;
  isFeedback: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TaskCommentSchema = new Schema<ITaskComment>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    commentText: { type: String, required: true },
    isFeedback: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Indexes
TaskCommentSchema.index({ taskId: 1 });
TaskCommentSchema.index({ userId: 1 });

export default mongoose.model<ITaskComment>("TaskComment", TaskCommentSchema);
