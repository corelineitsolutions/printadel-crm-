import mongoose, { Schema, Document } from "mongoose";

export enum OrderFormStatus {
  PENDING = "PENDING",
  CONVERTED = "CONVERTED",
}

export enum OrderType {
  NEW = "NEW",
  REPEAT = "REPEAT",
  REPRINT = "REPRINT",
}

export enum OrderPriority {
  NORMAL = "NORMAL",
  URGENT = "URGENT",
}

export const ORDER_CATEGORIES = [
  "DIGITAL",
  "ACRYLIC",
  "FLEX_VINYL_BOARD",
  "OFFSET",
  "PHOTO_ALBUM",
  "EVENT",
  "ADVERTISING",
  "OTHER",
] as const;

export const DELIVERY_MODES = ["PICKUP", "DELIVERY", "INSTALL"] as const;

export interface IOrderFormItem {
  description: string;
  material?: string;
  size?: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface IOrderForm extends Document {
  formNumber: string;
  orderDate: Date;
  branch?: string;

  customerName: string;
  companyName?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  orderTakenBy?: string;

  orderType: OrderType;
  priority: OrderPriority;
  categories: string[];
  otherCategory?: string;
  jobName?: string;
  items: IOrderFormItem[];
  finish?: string;
  artworkInstructions?: string;

  deliveryDateTime?: Date | null;
  deliveryModes: string[];
  siteAddress?: string;
  landmark?: string;
  siteContact?: string;
  contactPhone?: string;
  installationDateTime?: Date | null;

  subtotal: number;
  extras: number;
  discount: number;
  transport: number;
  taxPercent: number;
  taxAmount: number;
  totalAmount: number;
  advance: number;
  balanceDue: number;
  paymentMode?: string;

  status: OrderFormStatus;
  quotationId?: mongoose.Types.ObjectId | null;
  convertedAt?: Date | null;
  convertedBy?: mongoose.Types.ObjectId | null;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OrderFormSchema = new Schema<IOrderForm>(
  {
    formNumber: { type: String, required: true, unique: true },
    orderDate: { type: Date, default: Date.now },
    branch: String,

    customerName: { type: String, required: true },
    companyName: String,
    phone: String,
    email: String,
    address: String,
    gstin: String,
    orderTakenBy: String,

    orderType: { type: String, enum: Object.values(OrderType), default: OrderType.NEW },
    priority: { type: String, enum: Object.values(OrderPriority), default: OrderPriority.NORMAL },
    categories: { type: [String], enum: ORDER_CATEGORIES, default: [] },
    otherCategory: String,
    jobName: String,
    items: [
      {
        description: { type: String, required: true },
        material: String,
        size: String,
        quantity: { type: Number, default: 1 },
        rate: { type: Number, default: 0 },
        amount: { type: Number, default: 0 },
      },
    ],
    finish: String,
    artworkInstructions: String,

    deliveryDateTime: { type: Date, default: null },
    deliveryModes: { type: [String], enum: DELIVERY_MODES, default: [] },
    siteAddress: String,
    landmark: String,
    siteContact: String,
    contactPhone: String,
    installationDateTime: { type: Date, default: null },

    subtotal: { type: Number, default: 0 },
    extras: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    transport: { type: Number, default: 0 },
    taxPercent: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    advance: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    paymentMode: String,

    status: { type: String, enum: Object.values(OrderFormStatus), default: OrderFormStatus.PENDING },
    quotationId: { type: Schema.Types.ObjectId, ref: "Quotation", default: null },
    convertedAt: { type: Date, default: null },
    convertedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

OrderFormSchema.index({ status: 1 });
OrderFormSchema.index({ createdBy: 1 });
OrderFormSchema.index({ createdAt: -1 });

OrderFormSchema.set("toJSON", { virtuals: true });
OrderFormSchema.set("toObject", { virtuals: true });

export default mongoose.model<IOrderForm>("OrderForm", OrderFormSchema);
