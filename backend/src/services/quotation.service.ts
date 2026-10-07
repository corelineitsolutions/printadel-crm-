import mongoose from "mongoose";
import Quotation, { QuotationStatus } from "../models/Quotation";
import User, { UserRole } from "../models/User";
import { createNotification } from "./notification.service";
import { NotificationType } from "../models/Notification";
import { getEmployeeDocumentUrl, QUOTATION_APPROVAL_PREFIX, uploadPrivateImage } from "../config/r2";

const MAX_APPROVAL_SCREENSHOTS = 5;
const DESIGNER_MATCH = /design/i;

export interface QuotationItemInput {
  description: string;
  quantity: number;
  rate: number;
}

export interface QuotationInput {
  subject: string;
  clientName: string;
  clientCompany?: string;
  clientPhone?: string;
  clientEmail?: string;
  clientAddress?: string;
  items: QuotationItemInput[];
  discount?: number;
  gstPercent?: number;
  validUntil?: string | null;
  notes?: string;
  terms?: string;
}

interface Requester {
  id: string;
  role: string;
}

const USER_FIELDS = "id fullName email designation department";
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function computeTotals(items: QuotationItemInput[], discountInput = 0, gstPercentInput = 0) {
  const normalizedItems = items.map((item) => {
    const quantity = Math.max(0, Number(item.quantity) || 0);
    const rate = Math.max(0, Number(item.rate) || 0);
    return { description: item.description.trim(), quantity, rate, amount: round2(quantity * rate) };
  });
  const subtotal = round2(normalizedItems.reduce((sum, item) => sum + item.amount, 0));
  const discount = Math.min(subtotal, Math.max(0, Number(discountInput) || 0));
  const gstPercent = Math.max(0, Number(gstPercentInput) || 0);
  const taxable = subtotal - discount;
  const gstAmount = round2((taxable * gstPercent) / 100);
  const totalAmount = round2(taxable + gstAmount);
  return { items: normalizedItems, subtotal, discount, gstPercent, gstAmount, totalAmount };
}

async function generateNextQuotationNumber(): Promise<string> {
  const prefix = `QT-${new Date().getFullYear()}-`;
  const latest = await Quotation.findOne({ quotationNumber: new RegExp(`^${prefix}\\d+`) })
    .sort({ createdAt: -1 })
    .select("quotationNumber");
  const lastSequence = latest ? parseInt(latest.quotationNumber.split("-")[2], 10) : 0;
  return `${prefix}${String((Number.isNaN(lastSequence) ? 0 : lastSequence) + 1).padStart(4, "0")}`;
}

function isManagerOrAdmin(requester: Requester) {
  return requester.role === UserRole.ADMIN || requester.role === UserRole.MANAGER;
}

function canAccess(quotation: any, requester: Requester) {
  if (isManagerOrAdmin(requester)) return true;
  const createdBy = String(quotation.createdBy?._id || quotation.createdBy);
  const assignedTo = quotation.assignedTo ? String(quotation.assignedTo._id || quotation.assignedTo) : null;
  return createdBy === requester.id || assignedTo === requester.id;
}

function populateQuotation(query: any) {
  return query
    .populate("assignedTo", USER_FIELDS)
    .populate("assignedBy", "id fullName")
    .populate("createdBy", "id fullName")
    .populate("completedBy", "id fullName")
    .populate("statusHistory.changedBy", "id fullName");
}

async function withScreenshotUrls(quotation: any) {
  const doc = quotation.toObject ? quotation.toObject({ virtuals: true }) : quotation;
  doc.id = String(doc._id);
  doc.approvalScreenshotUrls = await Promise.all(
    (doc.approvalScreenshots || []).map((key: string) => getEmployeeDocumentUrl(key).catch(() => null))
  );
  return doc;
}

export const quotationService = {
  async getNextQuotationNumber() {
    return { quotationNumber: await generateNextQuotationNumber() };
  },

  async getDesigners() {
    return User.find({
      isActive: true,
      $or: [{ designation: { $regex: DESIGNER_MATCH } }, { department: { $regex: DESIGNER_MATCH } }],
    })
      .select(USER_FIELDS)
      .sort({ fullName: 1 });
  },

  async createQuotation(data: QuotationInput, requester: Requester) {
    const totals = computeTotals(data.items, data.discount, data.gstPercent);
    const quotation = await Quotation.create({
      quotationNumber: await generateNextQuotationNumber(),
      subject: data.subject.trim(),
      clientName: data.clientName.trim(),
      clientCompany: data.clientCompany,
      clientPhone: data.clientPhone,
      clientEmail: data.clientEmail,
      clientAddress: data.clientAddress,
      ...totals,
      validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
      notes: data.notes,
      terms: data.terms,
      status: QuotationStatus.PENDING,
      createdBy: requester.id,
      statusHistory: [{ status: QuotationStatus.PENDING, changedBy: requester.id, note: "Quotation created" }],
    });
    return withScreenshotUrls(await populateQuotation(Quotation.findById(quotation._id)));
  },

  async getQuotations(requester: Requester, filters: { status?: string; search?: string; assignedTo?: string }) {
    const where: any = {};
    if (!isManagerOrAdmin(requester)) {
      const me = new mongoose.Types.ObjectId(requester.id);
      where.$or = [{ createdBy: me }, { assignedTo: me }];
    }
    if (filters.status && Object.values(QuotationStatus).includes(filters.status as QuotationStatus)) {
      where.status = filters.status;
    }
    if (filters.assignedTo && mongoose.Types.ObjectId.isValid(filters.assignedTo)) {
      where.assignedTo = filters.assignedTo;
    }
    if (filters.search) {
      const regex = new RegExp(filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const searchOr = [{ quotationNumber: regex }, { clientName: regex }, { clientCompany: regex }, { subject: regex }];
      where.$and = [...(where.$and || []), { $or: searchOr }];
    }

    const quotations = await populateQuotation(Quotation.find(where).sort({ createdAt: -1 }));
    return quotations.map((q: any) => {
      const doc = q.toObject({ virtuals: true });
      doc.id = String(doc._id);
      doc.approvalScreenshotCount = (doc.approvalScreenshots || []).length;
      delete doc.approvalScreenshots;
      return doc;
    });
  },

  async getQuotationById(id: string, requester: Requester) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Quotation not found");
    const quotation = await populateQuotation(Quotation.findById(id));
    if (!quotation) throw new Error("Quotation not found");
    if (!canAccess(quotation, requester)) throw new Error("You do not have access to this quotation");
    return withScreenshotUrls(quotation);
  },

  async updateQuotation(id: string, data: Partial<QuotationInput>, requester: Requester) {
    const quotation = await Quotation.findById(id);
    if (!quotation) throw new Error("Quotation not found");
    const isCreator = String(quotation.createdBy) === requester.id;
    if (!isManagerOrAdmin(requester) && !isCreator) {
      throw new Error("Only the creator, a manager or an admin can edit this quotation");
    }
    if (quotation.status === QuotationStatus.COMPLETED && requester.role !== UserRole.ADMIN) {
      throw new Error("Completed quotations can only be edited by an admin");
    }

    const fields: (keyof QuotationInput)[] = ["subject", "clientName", "clientCompany", "clientPhone", "clientEmail", "clientAddress", "notes", "terms"];
    fields.forEach((field) => {
      if (data[field] !== undefined) (quotation as any)[field] = data[field];
    });
    if (data.validUntil !== undefined) quotation.validUntil = data.validUntil ? new Date(data.validUntil) : undefined;

    if (data.items !== undefined || data.discount !== undefined || data.gstPercent !== undefined) {
      const totals = computeTotals(
        data.items ?? quotation.items.map((i) => ({ description: i.description, quantity: i.quantity, rate: i.rate })),
        data.discount ?? quotation.discount,
        data.gstPercent ?? quotation.gstPercent
      );
      quotation.set(totals);
    }

    await quotation.save();
    return withScreenshotUrls(await populateQuotation(Quotation.findById(id)));
  },

  async assignQuotation(id: string, designerId: string | null, requester: Requester) {
    if (requester.role !== UserRole.ADMIN) throw new Error("Only an admin can assign quotations");
    const quotation = await Quotation.findById(id);
    if (!quotation) throw new Error("Quotation not found");

    if (designerId) {
      const designer = await User.findById(designerId).select("fullName designation department isActive");
      const isDesigner = designer && (DESIGNER_MATCH.test(designer.designation || "") || DESIGNER_MATCH.test(designer.department || ""));
      if (!designer || !designer.isActive || !isDesigner) {
        throw new Error("Quotations can only be assigned to an active designer");
      }
      quotation.assignedTo = designer._id as any;
      quotation.assignedBy = new mongoose.Types.ObjectId(requester.id);
    } else {
      quotation.assignedTo = null;
      quotation.assignedBy = null;
    }
    await quotation.save();

    if (designerId && designerId !== requester.id) {
      await createNotification({
        userId: designerId,
        type: NotificationType.GENERAL,
        title: "Quotation Assigned",
        message: `Quotation ${quotation.quotationNumber} for ${quotation.clientName} has been assigned to you.`,
        link: "/quotations",
      }).catch(() => undefined);
    }

    return withScreenshotUrls(await populateQuotation(Quotation.findById(id)));
  },

  async updateStatus(
    id: string,
    data: { status: QuotationStatus; screenshots?: string[]; note?: string },
    requester: Requester
  ) {
    const quotation = await Quotation.findById(id);
    if (!quotation) throw new Error("Quotation not found");
    if (!canAccess(quotation, requester)) throw new Error("You do not have access to this quotation");

    const newScreenshots = data.screenshots || [];
    if (quotation.approvalScreenshots.length + newScreenshots.length > MAX_APPROVAL_SCREENSHOTS) {
      throw new Error(`You can attach up to ${MAX_APPROVAL_SCREENSHOTS} approval screenshots`);
    }
    if (data.status === QuotationStatus.COMPLETED && quotation.approvalScreenshots.length + newScreenshots.length === 0) {
      throw new Error("Upload the client approval chat screenshot to mark this quotation as completed");
    }

    for (const dataUrl of newScreenshots) {
      quotation.approvalScreenshots.push(await uploadPrivateImage(QUOTATION_APPROVAL_PREFIX, dataUrl));
    }

    if (quotation.status !== data.status) {
      quotation.status = data.status;
      quotation.statusHistory.push({
        status: data.status,
        changedBy: new mongoose.Types.ObjectId(requester.id),
        changedAt: new Date(),
        note: data.note,
      });
    }
    if (data.status === QuotationStatus.COMPLETED) {
      quotation.completedBy = new mongoose.Types.ObjectId(requester.id);
      quotation.completedAt = new Date();
      if (data.note) quotation.approvalNote = data.note;
    } else {
      quotation.completedBy = null;
      quotation.completedAt = null;
    }
    await quotation.save();

    return withScreenshotUrls(await populateQuotation(Quotation.findById(id)));
  },

  async deleteQuotation(id: string, requester: Requester) {
    if (requester.role !== UserRole.ADMIN) throw new Error("Only an admin can delete quotations");
    const deleted = await Quotation.findByIdAndDelete(id);
    if (!deleted) throw new Error("Quotation not found");
    return { id };
  },
};
