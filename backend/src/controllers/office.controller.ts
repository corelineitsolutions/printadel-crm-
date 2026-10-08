import { Request, Response } from "express";
import { z } from "zod";
import { successResponse, errorResponse } from "../utils/response.utils";
import * as officeService from "../services/office.service";
import { getClientIp, isPrivateIp, isValidIp } from "../utils/ip.utils";

const officeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().max(250).nullable().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(10).max(5000).optional(),
  wifiIps: z
    .array(
      z
        .string()
        .trim()
        .refine(isValidIp, (ip) => ({ message: `"${ip}" is not a valid IP address` }))
        .refine((ip) => !isPrivateIp(ip), (ip) => ({
          message: `${ip} is a local network address. Add the office's public IP instead: connect to the office Wi-Fi and click "Add this network".`,
        }))
    )
    .max(20)
    .optional(),
  isActive: z.boolean().optional(),
});

export async function getOffices(req: Request, res: Response) {
  try {
    const activeOnly = req.query.activeOnly === "true";
    const offices = await officeService.getAllOffices(!activeOnly);
    return successResponse(res, offices, "Offices retrieved successfully");
  } catch (error: any) {
    return errorResponse(res, error?.errors?.[0]?.message || error.message, 400);
  }
}

export async function createOffice(req: Request, res: Response) {
  try {
    const data = officeSchema.parse(req.body);
    const office = await officeService.createOffice(data, req.user!.id);
    return successResponse(res, office, "Office created successfully", 201);
  } catch (error: any) {
    return errorResponse(res, error?.errors?.[0]?.message || error.message, 400);
  }
}

export async function updateOffice(req: Request, res: Response) {
  try {
    const data = officeSchema.partial().parse(req.body);
    const office = await officeService.updateOffice(String(req.params.id), data);
    return successResponse(res, office, "Office updated successfully");
  } catch (error: any) {
    return errorResponse(res, error?.errors?.[0]?.message || error.message, 400);
  }
}

export async function addCurrentWifiIp(req: Request, res: Response) {
  try {
    const result = await officeService.addOfficeWifiIp(String(req.params.id), getClientIp(req));
    return successResponse(res, result, `Added ${result.ip} to ${result.office.name}`);
  } catch (error: any) {
    return errorResponse(res, error?.errors?.[0]?.message || error.message, 400);
  }
}

export async function deleteOffice(req: Request, res: Response) {
  try {
    await officeService.deleteOffice(String(req.params.id));
    return successResponse(res, null, "Office deleted successfully");
  } catch (error: any) {
    return errorResponse(res, error?.errors?.[0]?.message || error.message, 400);
  }
}
