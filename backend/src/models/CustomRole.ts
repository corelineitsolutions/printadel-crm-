import mongoose, { Schema, Document } from "mongoose";
import { UserRole } from "./User";

export interface ICustomRole extends Document {
  name: string;
  baseRole: UserRole;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CustomRoleSchema = new Schema<ICustomRole>(
  {
    name: { type: String, required: true, trim: true },
    baseRole: { type: String, enum: Object.values(UserRole), default: UserRole.EMPLOYEE },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

CustomRoleSchema.index({ name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

export default mongoose.model<ICustomRole>("CustomRole", CustomRoleSchema);
