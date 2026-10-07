import { Request, Response } from "express";
import { z } from "zod";
import { quotationService } from "../services/quotation.service";
import { successResponse, errorResponse } from "../utils/response.utils";
import { QuotationStatus } from "../models/Quotation";

const itemSchema = z.object({
  description: z.string().trim().min(1, "Item description is required"),
  quantity: z.number().min(0),
  rate: z.number().min(0),
});

const quotationSchema = z.object({
  subject: z.string().trim().min(2, "Subject is required"),
  clientName: z.string().trim().min(2, "Client name is required"),
  clientCompany: z.string().optional(),
  clientPhone: z.string().optional(),
  clientEmail: z.string().optional(),
  clientAddress: z.string().optional(),
  items: z.array(itemSchema).min(1, "Add at least one item"),
  discount: z.number().min(0).optional(),
  gstPercent: z.number().min(0).max(100).optional(),
  validUntil: z.string().nullable().optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
  assignedTo: z.string().nullable().optional(),
});

const assignSchema = z.object({
  designerId: z.string().nullable(),
});

const statusSchema = z.object({
  status: z.nativeEnum(QuotationStatus),
  screenshots: z.array(z.string().min(1)).max(5).optional(),
  note: z.string().optional(),
});

const requesterOf = (req: Request) => ({ id: req.user!.id, role: req.user!.role });

const fail = (res: Response, error: any, fallback: string) => {
  const message = error?.errors?.[0]?.message || error?.message || fallback;
  const status = /access|only/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
  return errorResponse(res, message, status);
};

export async function getNextQuotationNumber(_req: Request, res: Response) {
  try {
    return successResponse(res, await quotationService.getNextQuotationNumber(), "Next quotation number");
  } catch (error: any) {
    return fail(res, error, "Failed to get next quotation number");
  }
}

export async function getDesigners(_req: Request, res: Response) {
  try {
    return successResponse(res, await quotationService.getDesigners(), "Designers retrieved");
  } catch (error: any) {
    return fail(res, error, "Failed to load designers");
  }
}

export async function createQuotation(req: Request, res: Response) {
  try {
    const data = quotationSchema.parse(req.body);
    const quotation = await quotationService.createQuotation(data, requesterOf(req));
    return successResponse(res, quotation, "Quotation created", 201);
  } catch (error: any) {
    return fail(res, error, "Failed to create quotation");
  }
}

export async function getQuotations(req: Request, res: Response) {
  try {
    const quotations = await quotationService.getQuotations(requesterOf(req), {
      status: req.query.status as string,
      search: req.query.search as string,
      assignedTo: req.query.assignedTo as string,
    });
    return successResponse(res, quotations, "Quotations retrieved");
  } catch (error: any) {
    return fail(res, error, "Failed to load quotations");
  }
}

export async function getQuotationById(req: Request, res: Response) {
  try {
    return successResponse(res, await quotationService.getQuotationById(req.params.id as string, requesterOf(req)), "Quotation retrieved");
  } catch (error: any) {
    return fail(res, error, "Failed to load quotation");
  }
}

export async function updateQuotation(req: Request, res: Response) {
  try {
    const data = quotationSchema.partial().parse(req.body);
    const quotation = await quotationService.updateQuotation(req.params.id as string, data, requesterOf(req));
    return successResponse(res, quotation, "Quotation updated");
  } catch (error: any) {
    return fail(res, error, "Failed to update quotation");
  }
}

export async function assignQuotation(req: Request, res: Response) {
  try {
    const { designerId } = assignSchema.parse(req.body);
    const quotation = await quotationService.assignQuotation(req.params.id as string, designerId, requesterOf(req));
    return successResponse(res, quotation, designerId ? "Quotation assigned" : "Quotation unassigned");
  } catch (error: any) {
    return fail(res, error, "Failed to assign quotation");
  }
}

export async function updateQuotationStatus(req: Request, res: Response) {
  try {
    const data = statusSchema.parse(req.body);
    const quotation = await quotationService.updateStatus(req.params.id as string, data, requesterOf(req));
    return successResponse(res, quotation, "Quotation status updated");
  } catch (error: any) {
    return fail(res, error, "Failed to update quotation status");
  }
}

export async function deleteQuotation(req: Request, res: Response) {
  try {
    return successResponse(res, await quotationService.deleteQuotation(req.params.id as string, requesterOf(req)), "Quotation deleted");
  } catch (error: any) {
    return fail(res, error, "Failed to delete quotation");
  }
}
