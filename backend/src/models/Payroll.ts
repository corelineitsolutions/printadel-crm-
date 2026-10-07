import mongoose, { Schema, Document } from "mongoose";

export enum PayrollStatus {
  DRAFT = "DRAFT",
  PENDING = "PENDING",
  PROCESSED = "PROCESSED",
  APPROVED = "APPROVED",
  PAID = "PAID",
  CANCELLED = "CANCELLED",
}

export interface IPayroll extends Document {
  userId: mongoose.Types.ObjectId;
  month: number;
  year: number;
  employeeType?: string;
  payrollRule?: string;
  hourlyRate?: number;
  overtimeRate?: number;
  totalWorkingHours: number;
  regularHours: number;
  overtimeHours: number;
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  extraWorkDays: number;
  extraSundayDays?: number;
  holidayWorkDays?: number;
  dailySalary?: number;
  extraWorkPay?: number;
  absentDeduction?: number;
  attendanceAdjustedSalary?: number;
  calendarDays?: number;
  regularWorkingDays?: number;
  publicHolidays?: number;
  paidLeaveDays?: number;
  unpaidLeaveDays?: number;
  basicSalary: number;
  monthlySalary?: number;
  allowances: number;
  grossPay: number;
  overtimePay: number;
  bonuses: number;
  lateCount?: number;
  lateDeduction?: number;
  deductions: number;
  netPay: number;
  // Full-time salary sheet (Excel format)
  salaryRate?: number;
  monthDays?: number;
  daysWorked?: number;
  daysWorkedManual?: boolean;
  earnedSalary?: number;
  basicDa?: number;
  hra?: number;
  conveyance?: number;
  epf?: number;
  esic?: number;
  professionalTax?: number;
  advanceDeduction?: number;
  otherDeduction?: number;
  status: PayrollStatus;
  processedBy?: mongoose.Types.ObjectId;
  processedAt?: Date;
  paidAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PayrollSchema = new Schema<IPayroll>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    employeeType: { type: String, default: "Full-time" },
    payrollRule: { type: String, default: "FULL_TIME_MONTHLY" },
    monthlySalary: { type: Number, default: 0 },
    hourlyRate: { type: Number, default: 0 },
    overtimeRate: { type: Number, default: 0 },
    totalWorkingHours: { type: Number, default: 0 },
    regularHours: { type: Number, default: 0 },
    overtimeHours: { type: Number, default: 0 },
    totalWorkingDays: { type: Number, default: 0 },
    presentDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    leaveDays: { type: Number, default: 0 },
    extraWorkDays: { type: Number, default: 0 },
    extraSundayDays: { type: Number, default: 0 },
    holidayWorkDays: { type: Number, default: 0 },
    dailySalary: { type: Number, default: 0 },
    extraWorkPay: { type: Number, default: 0 },
    absentDeduction: { type: Number, default: 0 },
    attendanceAdjustedSalary: { type: Number, default: 0 },
    calendarDays: { type: Number, default: 0 },
    regularWorkingDays: { type: Number, default: 0 },
    publicHolidays: { type: Number, default: 0 },
    paidLeaveDays: { type: Number, default: 0 },
    unpaidLeaveDays: { type: Number, default: 0 },
    basicSalary: { type: Number, required: true },
    allowances: { type: Number, default: 0 },
    grossPay: { type: Number, default: 0 },
    overtimePay: { type: Number, default: 0 },
    bonuses: { type: Number, default: 0 },
    lateCount: { type: Number, default: 0 },
    lateDeduction: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    netPay: { type: Number, required: true },
    salaryRate: { type: Number, default: 0 },
    monthDays: { type: Number, default: 0 },
    daysWorked: { type: Number, default: 0 },
    daysWorkedManual: { type: Boolean, default: false },
    earnedSalary: { type: Number, default: 0 },
    basicDa: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    conveyance: { type: Number, default: 0 },
    epf: { type: Number, default: 0 },
    esic: { type: Number, default: 0 },
    professionalTax: { type: Number, default: 0 },
    advanceDeduction: { type: Number, default: 0 },
    otherDeduction: { type: Number, default: 0 },
    status: { type: String, enum: Object.values(PayrollStatus), default: PayrollStatus.DRAFT },
    processedBy: { type: Schema.Types.ObjectId, ref: "User" },
    processedAt: Date,
    paidAt: Date,
    notes: String,
  },
  { timestamps: true }
);

// Virtuals
PayrollSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

PayrollSchema.virtual("processor", {
  ref: "User",
  localField: "processedBy",
  foreignField: "_id",
  justOne: true,
});

// Configure JSON output to include virtuals
PayrollSchema.set("toJSON", { virtuals: true });
PayrollSchema.set("toObject", { virtuals: true });

// Indexes
PayrollSchema.index({ userId: 1 });
PayrollSchema.index({ month: 1, year: 1 });
PayrollSchema.index({ status: 1 });

export default mongoose.model<IPayroll>("Payroll", PayrollSchema);
