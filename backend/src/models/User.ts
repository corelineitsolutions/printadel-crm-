import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export enum UserRole {
  ADMIN = "ADMIN",
  MANAGER = "MANAGER",
  EMPLOYEE = "EMPLOYEE",
}

export enum EmployeeType {
  FULL_TIME = "Full-time",
  PART_TIME = "Part-time",
  CONTRACT = "Contract",
}

export interface IUser extends Document {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  roleName?: string | null;
  employeeType: EmployeeType;
  employeeId?: string | null;
  designation?: string | null;
  department?: string | null;
  phone?: string | null;
  address?: string | null;
  joinDate: Date;
  monthlySalary?: number | null;
  hourlyRate?: number | null;
  overtimeMultiplier: number;
  managerId?: mongoose.Types.ObjectId | null;
  isActive: boolean;
  emergencyContact?: string | null;
  dateOfBirth?: Date | null;
  panCardKey?: string | null;
  aadhaarCardKey?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    fullName: { type: String, required: true },
    role: { type: String, enum: Object.values(UserRole), default: UserRole.EMPLOYEE },
    roleName: String,
    employeeType: { type: String, enum: Object.values(EmployeeType), default: EmployeeType.FULL_TIME },
    employeeId: { type: String, unique: true, sparse: true },
    designation: String,
    department: String,
    phone: String,
    address: String,
    joinDate: { type: Date, default: Date.now },
    monthlySalary: Number,
    hourlyRate: Number,
    overtimeMultiplier: { type: Number, default: 1.5 },
    managerId: { type: Schema.Types.ObjectId, ref: "User" },
    isActive: { type: Boolean, default: true },
    emergencyContact: String,
    dateOfBirth: Date,
    panCardKey: String,
    aadhaarCardKey: String,
  },
  { timestamps: true }
);

// Password hashing middleware
UserSchema.pre("save", async function() {
  if (!this.isModified("password")) return;
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (err: any) {
    throw err;
  }
});

// Indexes
UserSchema.index({ role: 1 });
UserSchema.index({ employeeType: 1 });
UserSchema.index({ managerId: 1 });

// Virtual for manager population
UserSchema.virtual("manager", {
  ref: "User",
  localField: "managerId",
  foreignField: "_id",
  justOne: true,
});

// Configure JSON output to include virtuals
UserSchema.set("toJSON", { virtuals: true });
UserSchema.set("toObject", { virtuals: true });

export default mongoose.model<IUser>("User", UserSchema);
