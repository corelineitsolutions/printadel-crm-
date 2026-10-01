import { Request, Response } from "express";
import { z } from "zod";
import { jobCardService } from "../services/jobCard.service";
import { successResponse, errorResponse } from "../utils/response.utils";
import { JobCardPriority, JobCardStatus } from "../models/JobCard";

// Validation schemas
const createJobCardSchema = z.object({
  jobCardNumber: z.string().optional(),
  orderNumber: z.string().optional(),
  title: z.string().min(3, "Title must be at least 3 characters"),
  clientName: z.string().min(2, "Client name is required"),
  clientPhone: z.string().optional(),
  clientEmail: z.string().optional(),
  description: z.string().optional(),
  specifications: z.string().optional(),
  paperStock: z.string().optional(),
  size: z.string().optional(),
  quantity: z.number().min(1).optional(),
  finish: z.string().optional(),
  priority: z.nativeEnum(JobCardPriority).optional(),
  status: z.nativeEnum(JobCardStatus).optional(),
  assignedTo: z.array(z.string()).min(1, "At least one assignee is required"),
  projectId: z.string().optional(),
  targetDeliveryDate: z.string().optional(),
  estimatedHours: z.number().optional(),
  attachments: z.array(z.string()).optional(),
});

const updateJobCardSchema = z.object({
  orderNumber: z.string().optional(),
  title: z.string().min(3).optional(),
  clientName: z.string().min(2).optional(),
  clientPhone: z.string().optional(),
  clientEmail: z.string().optional(),
  description: z.string().optional(),
  specifications: z.string().optional(),
  paperStock: z.string().optional(),
  size: z.string().optional(),
  quantity: z.number().min(1).optional(),
  finish: z.string().optional(),
  priority: z.nativeEnum(JobCardPriority).optional(),
  status: z.nativeEnum(JobCardStatus).optional(),
  assignedTo: z.array(z.string()).optional(),
  projectId: z.string().optional(),
  targetDeliveryDate: z.string().optional(),
  estimatedHours: z.number().optional(),
  actualHours: z.number().optional(),
  attachments: z.array(z.string()).optional(),
  statusNote: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(JobCardStatus),
  note: z.string().optional(),
});

export async function createJobCard(req: Request, res: Response) {
  try {
    const validatedData = createJobCardSchema.parse(req.body);
    const userId = req.user!.id;
    const jobCard = await jobCardService.createJobCard(validatedData, userId);
    return successResponse(res, jobCard, "Job card created successfully", 201);
  } catch (error: any) {
    return errorResponse(res, error.message || "Failed to create job card", 400);
  }
}

export async function getJobCards(req: Request, res: Response) {
  try {
    const filters = {
      search: req.query.search as string,
      status: req.query.status as string,
      priority: req.query.priority as string,
      assignedTo: req.query.assignedTo as string,
      projectId: req.query.projectId as string,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    };
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const result = await jobCardService.getJobCards(filters, userId, userRole);
    return successResponse(res, result, "Job cards retrieved successfully");
  } catch (error: any) {
    return errorResponse(res, error.message || "Failed to retrieve job cards", 500);
  }
}

export async function getJobCardById(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    const jobCard = await jobCardService.getJobCardById(id);
    return successResponse(res, jobCard, "Job card retrieved successfully");
  } catch (error: any) {
    return errorResponse(res, error.message || "Failed to retrieve job card", 404);
  }
}

export async function updateJobCard(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    const validatedData = updateJobCardSchema.parse(req.body);
    const userId = req.user!.id;
    const updated = await jobCardService.updateJobCard(id, validatedData, userId);
    return successResponse(res, updated, "Job card updated successfully");
  } catch (error: any) {
    return errorResponse(res, error.message || "Failed to update job card", 400);
  }
}

export async function updateJobCardStatus(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    const { status, note } = updateStatusSchema.parse(req.body);
    const userId = req.user!.id;
    const updated = await jobCardService.updateStatus(id, status, note, userId);
    return successResponse(res, updated, "Status updated successfully");
  } catch (error: any) {
    return errorResponse(res, error.message || "Failed to update status", 400);
  }
}

export async function deleteJobCard(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    const result = await jobCardService.deleteJobCard(id);
    return successResponse(res, result, "Job card deleted successfully");
  } catch (error: any) {
    return errorResponse(res, error.message || "Failed to delete job card", 400);
  }
}

export async function getNextJobCardNumber(_req: Request, res: Response) {
  try {
    const result = await jobCardService.getNextJobCardNumber();
    return successResponse(res, result, "Next job card number generated");
  } catch (error: any) {
    return errorResponse(res, error.message || "Failed to generate job card number", 500);
  }
}

export async function getJobCardStats(_req: Request, res: Response) {
  try {
    const stats = await jobCardService.getJobCardStats();
    return successResponse(res, stats, "Job card statistics retrieved successfully");
  } catch (error: any) {
    return errorResponse(res, error.message || "Failed to retrieve job card statistics", 500);
  }
}
