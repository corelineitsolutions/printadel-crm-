import mongoose, { Schema, Document } from "mongoose";

export interface IProjectMember extends Document {
  projectId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role?: string;
  joinedAt: Date;
}

const ProjectMemberSchema = new Schema<IProjectMember>({
  projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  role: String,
  joinedAt: { type: Date, default: Date.now },
});

// Indexes
ProjectMemberSchema.index({ projectId: 1 });
ProjectMemberSchema.index({ userId: 1 });
ProjectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });

// Virtual for user population
ProjectMemberSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

// Configure JSON output to include virtuals
ProjectMemberSchema.set("toJSON", { virtuals: true });
ProjectMemberSchema.set("toObject", { virtuals: true });

export default mongoose.model<IProjectMember>("ProjectMember", ProjectMemberSchema);
