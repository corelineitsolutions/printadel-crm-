import mongoose, { Schema, Document } from "mongoose";

export interface IOffice extends Document {
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OfficeSchema = new Schema<IOffice>(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    radiusMeters: { type: Number, default: 100, min: 10 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

OfficeSchema.index({ name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

OfficeSchema.set("toJSON", { virtuals: true });
OfficeSchema.set("toObject", { virtuals: true });

export default mongoose.model<IOffice>("Office", OfficeSchema);
