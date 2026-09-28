import mongoose, { Schema, Document } from "mongoose";

export interface ISetting extends Document {
  key: string;
  value: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SettingSchema = new Schema<ISetting>(
  {
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true },
    description: String,
  },
  { timestamps: true }
);

// Indexes

export default mongoose.model<ISetting>("Setting", SettingSchema);
