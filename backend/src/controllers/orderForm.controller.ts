import { Request, Response } from "express";
import { z } from "zod";
import { orderFormService } from "../services/orderForm.service";
import { successResponse, errorResponse } from "../utils/response.utils";
import { DELIVERY_MODES, ORDER_CATEGORIES, OrderFormStatus, OrderPriority, OrderType } from "../models/OrderForm";

const itemSchema = z.object({
  description: z.string().trim().min(1, "Item description is required"),
  material: z.string().optional(),
  size: z.string().optional(),
  quantity: z.number().min(0),
  rate: z.number().min(0),
});

const amount = z.number().min(0).optional();

const orderFormSchema = z.object({
  orderDate: z.string().nullable().optional(),
  branch: z.string().optional(),
  customerName: z.string().trim().min(2, "Customer name is required"),
  companyName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  gstin: z.string().optional(),
  orderTakenBy: z.string().optional(),
  orderType: z.nativeEnum(OrderType).optional(),
  priority: z.nativeEnum(OrderPriority).optional(),
  categories: z.array(z.enum(ORDER_CATEGORIES)).optional(),
  otherCategory: z.string().optional(),
  jobName: z.string().optional(),
  items: z.array(itemSchema).min(1, "Add at least one item"),
  finish: z.string().optional(),
  artworkInstructions: z.string().optional(),
  deliveryDateTime: z.string().nullable().optional(),
  deliveryModes: z.array(z.enum(DELIVERY_MODES)).optional(),
  siteAddress: z.string().optional(),
  landmark: z.string().optional(),
  siteContact: z.string().optional(),
  contactPhone: z.string().optional(),
  installationDateTime: z.string().nullable().optional(),
  extras: amount,
  discount: amount,
  transport: amount,
  taxPercent: z.number().min(0).max(100).optional(),
  advance: amount,
  paymentMode: z.string().optional(),
});

const requesterOf = (req: Request) => ({ id: req.user!.id, role: req.user!.role });

const fail = (res: Response, error: any, fallback: string) => {
  const message = error?.errors?.[0]?.message || error?.message || fallback;
  const status = /access|only/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
  return errorResponse(res, message, status);
};

export async function getNextFormNumber(_req: Request, res: Response) {
  try {
    return successResponse(res, await orderFormService.getNextFormNumber(), "Next order form number");
  } catch (error: any) {
    return fail(res, error, "Failed to get next order form number");
  }
}

export async function getOrderForms(req: Request, res: Response) {
  try {
    const status = req.query.status as string;
    const orderForms = await orderFormService.getOrderForms(requesterOf(req), {
      status: Object.values(OrderFormStatus).includes(status as OrderFormStatus) ? status : undefined,
      search: req.query.search as string,
    });
    return successResponse(res, orderForms, "Order forms retrieved");
  } catch (error: any) {
    return fail(res, error, "Failed to load order forms");
  }
}

export async function getOrderFormById(req: Request, res: Response) {
  try {
    return successResponse(res, await orderFormService.getOrderFormById(String(req.params.id), requesterOf(req)), "Order form retrieved");
  } catch (error: any) {
    return fail(res, error, "Failed to load order form");
  }
}

export async function createOrderForm(req: Request, res: Response) {
  try {
    const data = orderFormSchema.parse(req.body);
    return successResponse(res, await orderFormService.createOrderForm(data, requesterOf(req)), "Order form created", 201);
  } catch (error: any) {
    return fail(res, error, "Failed to create order form");
  }
}

export async function updateOrderForm(req: Request, res: Response) {
  try {
    const data = orderFormSchema.parse(req.body);
    return successResponse(res, await orderFormService.updateOrderForm(String(req.params.id), data, requesterOf(req)), "Order form updated");
  } catch (error: any) {
    return fail(res, error, "Failed to update order form");
  }
}

export async function convertOrderForm(req: Request, res: Response) {
  try {
    const result = await orderFormService.convertToQuotation(String(req.params.id), requesterOf(req));
    return successResponse(res, result, `Converted to quotation ${result.quotation.quotationNumber}`, 201);
  } catch (error: any) {
    return fail(res, error, "Failed to convert order form");
  }
}

export async function deleteOrderForm(req: Request, res: Response) {
  try {
    return successResponse(res, await orderFormService.deleteOrderForm(String(req.params.id), requesterOf(req)), "Order form deleted");
  } catch (error: any) {
    return fail(res, error, "Failed to delete order form");
  }
}
