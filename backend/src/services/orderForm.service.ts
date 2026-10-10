import mongoose from "mongoose";
import OrderForm, { OrderFormStatus, OrderPriority, OrderType } from "../models/OrderForm";
import Quotation from "../models/Quotation";
import User, { UserRole } from "../models/User";
import { quotationService } from "./quotation.service";

export interface OrderFormItemInput {
  description: string;
  material?: string;
  size?: string;
  quantity: number;
  rate: number;
}

export interface OrderFormInput {
  orderDate?: string | null;
  branch?: string;
  customerName: string;
  companyName?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  orderTakenBy?: string;
  orderType?: OrderType;
  priority?: OrderPriority;
  categories?: string[];
  otherCategory?: string;
  jobName?: string;
  items: OrderFormItemInput[];
  finish?: string;
  artworkInstructions?: string;
  deliveryDateTime?: string | null;
  deliveryModes?: string[];
  siteAddress?: string;
  landmark?: string;
  siteContact?: string;
  contactPhone?: string;
  installationDateTime?: string | null;
  extras?: number;
  discount?: number;
  transport?: number;
  taxPercent?: number;
  advance?: number;
  paymentMode?: string;
}

interface Requester {
  id: string;
  role: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n: unknown) => Math.max(0, Number(n) || 0);

const CATEGORY_LABELS: Record<string, string> = {
  DIGITAL: "Digital",
  ACRYLIC: "Acrylic",
  FLEX_VINYL_BOARD: "Flex, Vinyl & Board",
  OFFSET: "Offset",
  PHOTO_ALBUM: "Photo Album",
  EVENT: "Event",
  ADVERTISING: "Advertising",
  OTHER: "Other",
};

/** Tax is charged on items + extras + transport after discount, matching how quotations total up. */
export function computeOrderTotals(input: {
  items: OrderFormItemInput[];
  extras?: number;
  discount?: number;
  transport?: number;
  taxPercent?: number;
  advance?: number;
}) {
  const items = input.items.map((item) => {
    const quantity = money(item.quantity);
    const rate = money(item.rate);
    return {
      description: item.description.trim(),
      material: item.material?.trim() || undefined,
      size: item.size?.trim() || undefined,
      quantity,
      rate,
      amount: round2(quantity * rate),
    };
  });
  const subtotal = round2(items.reduce((sum, item) => sum + item.amount, 0));
  const extras = money(input.extras);
  const transport = money(input.transport);
  const gross = subtotal + extras + transport;
  const discount = Math.min(gross, money(input.discount));
  const taxPercent = Math.min(100, money(input.taxPercent));
  const taxable = gross - discount;
  const taxAmount = round2((taxable * taxPercent) / 100);
  const totalAmount = round2(taxable + taxAmount);
  const advance = money(input.advance);
  const balanceDue = round2(totalAmount - advance);
  return { items, subtotal, extras, transport, discount, taxPercent, taxAmount, totalAmount, advance, balanceDue };
}

async function generateNextFormNumber(): Promise<string> {
  const prefix = `OF-${new Date().getFullYear()}-`;
  const latest = await OrderForm.findOne({ formNumber: new RegExp(`^${prefix}\\d+`) })
    .sort({ createdAt: -1 })
    .select("formNumber");
  const lastSequence = latest ? parseInt(latest.formNumber.split("-")[2], 10) : 0;
  return `${prefix}${String((Number.isNaN(lastSequence) ? 0 : lastSequence) + 1).padStart(4, "0")}`;
}

function isManagerOrAdmin(requester: Requester) {
  return requester.role === UserRole.ADMIN || requester.role === UserRole.MANAGER;
}

function assertCanModify(orderForm: any, requester: Requester) {
  const isCreator = String(orderForm.createdBy?._id || orderForm.createdBy) === requester.id;
  if (!isManagerOrAdmin(requester) && !isCreator) {
    throw new Error("Only the creator, a manager or an admin can change this order form");
  }
}

const toDate = (value?: string | null) => (value ? new Date(value) : null);

function populateOrderForm(query: any) {
  return query
    .populate("createdBy", "id fullName")
    .populate("convertedBy", "id fullName")
    .populate("quotationId", "quotationNumber status totalAmount");
}

function toResponse(orderForm: any) {
  const doc = orderForm.toObject ? orderForm.toObject({ virtuals: true }) : orderForm;
  doc.id = String(doc._id);
  return doc;
}

function buildFields(data: OrderFormInput) {
  return {
    orderDate: data.orderDate ? new Date(data.orderDate) : new Date(),
    branch: data.branch?.trim() || undefined,
    customerName: data.customerName.trim(),
    companyName: data.companyName?.trim() || undefined,
    phone: data.phone?.trim() || undefined,
    email: data.email?.trim() || undefined,
    address: data.address?.trim() || undefined,
    gstin: data.gstin?.trim().toUpperCase() || undefined,
    orderTakenBy: data.orderTakenBy?.trim() || undefined,
    orderType: data.orderType || OrderType.NEW,
    priority: data.priority || OrderPriority.NORMAL,
    categories: data.categories || [],
    otherCategory: data.categories?.includes("OTHER") ? data.otherCategory?.trim() || undefined : undefined,
    jobName: data.jobName?.trim() || undefined,
    finish: data.finish?.trim() || undefined,
    artworkInstructions: data.artworkInstructions?.trim() || undefined,
    deliveryDateTime: toDate(data.deliveryDateTime),
    deliveryModes: data.deliveryModes || [],
    siteAddress: data.siteAddress?.trim() || undefined,
    landmark: data.landmark?.trim() || undefined,
    siteContact: data.siteContact?.trim() || undefined,
    contactPhone: data.contactPhone?.trim() || undefined,
    installationDateTime: toDate(data.installationDateTime),
    paymentMode: data.paymentMode?.trim() || undefined,
    ...computeOrderTotals(data),
  };
}

function formatDateTime(value?: Date | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}

/** Folds the order-only details (category, finishing, delivery, payment) into the quotation notes. */
function buildQuotationNotes(orderForm: any) {
  const lines: string[] = [`Converted from order form ${orderForm.formNumber}.`];
  const categories = (orderForm.categories || [])
    .map((c: string) => (c === "OTHER" && orderForm.otherCategory ? orderForm.otherCategory : CATEGORY_LABELS[c] || c))
    .join(", ");
  lines.push(`Order type: ${orderForm.orderType} | Priority: ${orderForm.priority}`);
  if (categories) lines.push(`Category: ${categories}`);
  if (orderForm.finish) lines.push(`Finish / Lamination / Mounting / Lighting: ${orderForm.finish}`);
  if (orderForm.artworkInstructions) lines.push(`Artwork / Special instructions: ${orderForm.artworkInstructions}`);

  const delivery: string[] = [];
  if (orderForm.deliveryModes?.length) delivery.push(orderForm.deliveryModes.join(" / "));
  const deliveryAt = formatDateTime(orderForm.deliveryDateTime);
  if (deliveryAt) delivery.push(`on ${deliveryAt}`);
  if (orderForm.siteAddress) delivery.push(`at ${orderForm.siteAddress}`);
  if (orderForm.landmark) delivery.push(`(near ${orderForm.landmark})`);
  if (delivery.length) lines.push(`Delivery: ${delivery.join(" ")}`);
  if (orderForm.siteContact || orderForm.contactPhone) {
    lines.push(`Site contact: ${[orderForm.siteContact, orderForm.contactPhone].filter(Boolean).join(", ")}`);
  }
  const installAt = formatDateTime(orderForm.installationDateTime);
  if (installAt) lines.push(`Installation: ${installAt}`);
  if (orderForm.gstin) lines.push(`Customer GSTIN: ${orderForm.gstin}`);
  if (orderForm.advance > 0) {
    lines.push(`Advance received: ₹${orderForm.advance}${orderForm.paymentMode ? ` (${orderForm.paymentMode})` : ""}`);
  }
  return lines.join("\n");
}

export const orderFormService = {
  async getNextFormNumber() {
    return { formNumber: await generateNextFormNumber() };
  },

  async createOrderForm(data: OrderFormInput, requester: Requester) {
    if (!data.orderTakenBy?.trim()) {
      const me = await User.findById(requester.id).select("fullName");
      data.orderTakenBy = me?.fullName;
    }
    const orderForm = await OrderForm.create({
      ...buildFields(data),
      formNumber: await generateNextFormNumber(),
      status: OrderFormStatus.PENDING,
      createdBy: requester.id,
    });
    return toResponse(await populateOrderForm(OrderForm.findById(orderForm._id)));
  },

  async getOrderForms(requester: Requester, filters: { status?: string; search?: string }) {
    const where: any = {};
    if (!isManagerOrAdmin(requester)) where.createdBy = new mongoose.Types.ObjectId(requester.id);
    if (filters.status && Object.values(OrderFormStatus).includes(filters.status as OrderFormStatus)) {
      where.status = filters.status;
    }
    if (filters.search) {
      const regex = new RegExp(filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      where.$or = [{ formNumber: regex }, { customerName: regex }, { companyName: regex }, { jobName: regex }, { phone: regex }];
    }
    const orderForms = await populateOrderForm(OrderForm.find(where).sort({ createdAt: -1 }));
    return orderForms.map(toResponse);
  },

  async getOrderFormById(id: string, requester: Requester) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Order form not found");
    const orderForm = await populateOrderForm(OrderForm.findById(id));
    if (!orderForm) throw new Error("Order form not found");
    const isCreator = String(orderForm.createdBy?._id || orderForm.createdBy) === requester.id;
    if (!isManagerOrAdmin(requester) && !isCreator) throw new Error("You do not have access to this order form");
    return toResponse(orderForm);
  },

  async updateOrderForm(id: string, data: OrderFormInput, requester: Requester) {
    const orderForm = await OrderForm.findById(id);
    if (!orderForm) throw new Error("Order form not found");
    assertCanModify(orderForm, requester);
    if (orderForm.status === OrderFormStatus.CONVERTED && requester.role !== UserRole.ADMIN) {
      throw new Error("This order form is already converted to a quotation; only an admin can edit it");
    }
    orderForm.set(buildFields(data));
    await orderForm.save();
    return toResponse(await populateOrderForm(OrderForm.findById(id)));
  },

  async convertToQuotation(id: string, requester: Requester) {
    const orderForm = await OrderForm.findById(id);
    if (!orderForm) throw new Error("Order form not found");
    assertCanModify(orderForm, requester);
    if (orderForm.status === OrderFormStatus.CONVERTED && orderForm.quotationId) {
      const existing = await Quotation.findById(orderForm.quotationId).select("quotationNumber");
      if (existing) throw new Error(`Already converted to quotation ${existing.quotationNumber}`);
    }

    const items = orderForm.items.map((item) => ({
      description: [item.description, item.material, item.size].filter(Boolean).join(" — "),
      quantity: item.quantity,
      rate: item.rate,
    }));
    if (orderForm.extras > 0) {
      items.push({ description: "Extras (design / delivery / installation)", quantity: 1, rate: orderForm.extras });
    }
    if (orderForm.transport > 0) {
      items.push({ description: "Transport", quantity: 1, rate: orderForm.transport });
    }

    const quotation = await quotationService.createQuotation(
      {
        subject: orderForm.jobName || `Order ${orderForm.formNumber}`,
        clientName: orderForm.customerName,
        clientCompany: orderForm.companyName,
        clientPhone: orderForm.phone,
        clientEmail: orderForm.email,
        clientAddress: orderForm.address,
        items,
        discount: orderForm.discount,
        gstPercent: orderForm.taxPercent,
        notes: buildQuotationNotes(orderForm),
        orderFormId: String(orderForm._id),
      },
      requester
    );

    orderForm.status = OrderFormStatus.CONVERTED;
    orderForm.quotationId = new mongoose.Types.ObjectId(String(quotation._id));
    orderForm.convertedAt = new Date();
    orderForm.convertedBy = new mongoose.Types.ObjectId(requester.id);
    await orderForm.save();

    return { orderForm: toResponse(await populateOrderForm(OrderForm.findById(id))), quotation };
  },

  async deleteOrderForm(id: string, requester: Requester) {
    if (requester.role !== UserRole.ADMIN) throw new Error("Only an admin can delete order forms");
    const deleted = await OrderForm.findByIdAndDelete(id);
    if (!deleted) throw new Error("Order form not found");
    await Quotation.updateMany({ orderFormId: deleted._id }, { $set: { orderFormId: null } });
    return { id };
  },
};
