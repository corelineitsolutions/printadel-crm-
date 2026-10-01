import { Request, Response } from "express";
import { z } from "zod";
import { productivityService } from "../services/productivity.service";
import { successResponse, errorResponse } from "../utils/response.utils";
import { PRINTING_ACTIVITIES } from "../models/ProductivityLog";

const logActivitySchema = z.object({
  jobCardId: z.string().optional(),
  activityType: z.string().min(1, "Activity type is required"),
  durationMinutes: z.number().min(1).optional(),
  notes: z.string().optional(),
  isLogoutSession: z.boolean().optional(),
});

export async function logActivity(req: Request, res: Response) {
  try {
    const validatedData = logActivitySchema.parse(req.body);
    const userId = req.user!.id;

    const log = await productivityService.logActivity({
      ...validatedData,
      userId,
    });

    return successResponse(res, log, "Productivity activity logged successfully", 201);
  } catch (error: any) {
    return errorResponse(res, error.message || "Failed to log activity", 400);
  }
}

const logActivitiesBatchSchema = z.object({
  entries: z
    .array(
      z.object({
        jobCardId: z.string().optional(),
        activityType: z.string().min(1, "Activity type is required"),
        durationMinutes: z.number().min(1).optional(),
      })
    )
    .min(1, "Select at least one job card or general work")
    .max(50),
  notes: z.string().optional(),
  isLogoutSession: z.boolean().optional(),
});

export async function logActivitiesBatch(req: Request, res: Response) {
  try {
    const validatedData = logActivitiesBatchSchema.parse(req.body);
    const logs = await productivityService.logActivitiesBatch({
      ...validatedData,
      userId: req.user!.id,
    });
    return successResponse(res, logs, "Productivity activities logged successfully", 201);
  } catch (error: any) {
    const message = error?.issues?.[0]?.message || error.message || "Failed to log activities";
    return errorResponse(res, message, 400);
  }
}

export async function getMyProductivityLogs(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const filters = {
      jobCardId: req.query.jobCardId as string,
      activityType: req.query.activityType as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    };

    const result = await productivityService.getMyLogs(userId, filters);
    return successResponse(res, result, "My productivity logs retrieved successfully");
  } catch (error: any) {
    return errorResponse(res, error.message || "Failed to retrieve logs", 500);
  }
}

export async function getAllProductivityLogs(req: Request, res: Response) {
  try {
    const filters = {
      userId: req.query.userId as string,
      jobCardId: req.query.jobCardId as string,
      activityType: req.query.activityType as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    };

    const result = await productivityService.getAllLogs(filters);
    return successResponse(res, result, "All productivity logs retrieved successfully");
  } catch (error: any) {
    return errorResponse(res, error.message || "Failed to retrieve logs", 500);
  }
}

export async function getProductivityStats(req: Request, res: Response) {
  try {
    const requestingUserRole = req.user!.role;
    let userId = req.query.userId as string;

    // Regular employees can only view their own stats
    if (requestingUserRole === "EMPLOYEE") {
      userId = req.user!.id;
    }

    const filters = {
      userId,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    };

    const stats = await productivityService.getProductivityStats(filters);
    return successResponse(res, stats, "Productivity stats retrieved successfully");
  } catch (error: any) {
    return errorResponse(res, error.message || "Failed to retrieve stats", 500);
  }
}

export async function getActivityTypes(_req: Request, res: Response) {
  return successResponse(res, PRINTING_ACTIVITIES, "Activity types retrieved successfully");
}
