import mongoose, { Schema, Document } from "mongoose";

export enum QuotationStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export interface IQuotationItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface IQuotationStatusHistory {
  status: QuotationStatus;
  changedBy: mongoose.Types.ObjectId;
  changedAt: Date;
  note?: string;
}

export interface IQuotation extends Document {
  quotationNumber: string;
  subject: string;
  clientName: string;
  clientCompany?: string;
  clientPhone?: string;
  clientEmail?: string;
  clientAddress?: string;
  items: IQuotationItem[];
  subtotal: number;
  discount: number;
  gstPercent: number;
  gstAmount: number;
  totalAmount: number;
  validUntil?: Date;
  notes?: string;
  terms?: string;
  status: QuotationStatus;
  approvalScreenshots: string[];
  approvalNote?: string;
  assignedTo?: mongoose.Types.ObjectId | null;
  assignedBy?: mongoose.Types.ObjectId | null;
  createdBy: mongoose.Types.ObjectId;
  completedBy?: mongoose.Types.ObjectId | null;
  completedAt?: Date | null;
  statusHistory: IQuotationStatusHistory[];
  createdAt: Date;
  updatedAt: Date;
}

const QuotationSchema = new Schema<IQuotation>(
  {
    quotationNumber: { type: String, required: true, unique: true },
    subject: { type: String, required: true },
    clientName: { type: String, required: true },
    clientCompany: String,
    clientPhone: String,
    clientEmail: String,
    clientAddress: String,
    items: [
      {
        description: { type: String, required: true },
        quantity: { type: Number, default: 1 },
        rate: { type: Number, default: 0 },
        amount: { type: Number, default: 0 },
      },
    ],
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    gstPercent: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    validUntil: Date,
    notes: String,
    terms: String,
    status: { type: String, enum: Object.values(QuotationStatus), default: QuotationStatus.PENDING },
    approvalScreenshots: { type: [String], default: [] },
    approvalNote: String,
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    completedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    completedAt: { type: Date, default: null },
    statusHistory: [
      {
        status: { type: String, enum: Object.values(QuotationStatus), required: true },
        changedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        changedAt: { type: Date, default: Date.now },
        note: String,
      },
    ],
  },
  { timestamps: true }
);

QuotationSchema.index({ status: 1 });
QuotationSchema.index({ assignedTo: 1 });
QuotationSchema.index({ createdBy: 1 });
QuotationSchema.index({ createdAt: -1 });

export default mongoose.model<IQuotation>("Quotation", QuotationSchema);
