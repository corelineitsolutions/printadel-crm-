import { Request, Response } from "express";
import { z } from "zod";
import { successResponse, errorResponse } from "../utils/response.utils";
import * as officeService from "../services/office.service";

const officeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().max(250).nullable().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(10).max(5000).optional(),
  isActive: z.boolean().optional(),
});

export async function getOffices(req: Request, res: Response) {
  try {
    const activeOnly = req.query.activeOnly === "true";
    const offices = await officeService.getAllOffices(!activeOnly);
    return successResponse(res, offices, "Offices retrieved successfully");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

export async function createOffice(req: Request, res: Response) {
  try {
    const data = officeSchema.parse(req.body);
    const office = await officeService.createOffice(data, req.user!.id);
    return successResponse(res, office, "Office created successfully", 201);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

export async function updateOffice(req: Request, res: Response) {
  try {
    const data = officeSchema.partial().parse(req.body);
    const office = await officeService.updateOffice(String(req.params.id), data);
    return successResponse(res, office, "Office updated successfully");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

export async function deleteOffice(req: Request, res: Response) {
  try {
    await officeService.deleteOffice(String(req.params.id));
    return successResponse(res, null, "Office deleted successfully");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}
