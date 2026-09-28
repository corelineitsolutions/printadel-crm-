import { Request, Response } from "express";
import { z } from "zod";
import { successResponse, errorResponse } from "../utils/response.utils";
import Milestone, { MilestoneStatus } from "../models/Milestone";
import Project from "../models/Project";
import Task from "../models/Task";

/**
 * Milestone Controller
 * Handles milestone operations for projects
 */

// Validation schemas
const createMilestoneSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  dueDate: z.string().optional(),
});

const updateMilestoneSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]).optional(),
});

/**
 * POST /api/milestones
 * Create a new milestone
 */
export async function createMilestone(req: Request, res: Response) {
  try {
    const data = createMilestoneSchema.parse(req.body);

    // Check if project exists
    const project = await Project.findById(data.projectId);

    if (!project) {
      return errorResponse(res, "Project not found", 404);
    }

    // Create milestone
    const milestone = await Milestone.create({
      projectId: data.projectId,
      title: data.title,
      description: data.description,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      status: MilestoneStatus.NOT_STARTED,
    });

    // Populate or format if necessary, though simpler to return created object
    // mimicking Prisma include count roughly if needed or just return milestone
    const result = {
      ...milestone.toObject(),
      _count: { tasks: 0 }
    };

    return successResponse(res, result, "Milestone created successfully", 201);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/milestones
 * Get milestones (optionally filtered by project)
 */
export async function getMilestones(req: Request, res: Response) {
  try {
    const { projectId } = req.query;

    const where: any = {};
    if (projectId) where.projectId = projectId as string;

    const milestones = await Milestone.find(where)
      .populate("projectId", "id name code") // Populating project virtual or field matching schema. Milestone schema has projectId. Populate if referencing Project.
      .sort({ createdAt: -1 });

    // Manually get counts
    const enhancedMilestones = await Promise.all(
      milestones.map(async (m) => {
        const taskCount = await Task.countDocuments({ milestoneId: m._id });
        return {
          ...m.toObject(),
          _count: { tasks: taskCount }
        };
      })
    );

    return successResponse(res, { milestones: enhancedMilestones }, "Milestones retrieved successfully");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/milestones/:id
 * Get milestone by ID
 */
export async function getMilestoneById(req: Request, res: Response) {
  try {
    const id = req.params.id as string;

    const milestone = await Milestone.findById(id).populate("projectId", "id name code");

    if (!milestone) {
      return errorResponse(res, "Milestone not found", 404);
    }

    const tasks = await Task.find({ milestoneId: id }).populate("assignedTo", "id fullName email");
    const taskCount = await Task.countDocuments({ milestoneId: id });

    const result = {
      ...milestone.toObject(),
      tasks,
      _count: { tasks: taskCount }
    };

    return successResponse(res, result, "Milestone retrieved successfully");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * PUT /api/milestones/:id
 * Update milestone
 */
export async function updateMilestone(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const data = updateMilestoneSchema.parse(req.body);

    const milestone = await Milestone.findById(id);
    if (!milestone) {
      return errorResponse(res, "Milestone not found", 404);
    }

    const updated = await Milestone.findByIdAndUpdate(
      id,
      {
        $set: {
          ...data,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        },
      },
      { new: true }
    );

    const taskCount = await Task.countDocuments({ milestoneId: id });

    return successResponse(res, { ...updated?.toObject(), _count: { tasks: taskCount } }, "Milestone updated successfully");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * DELETE /api/milestones/:id
 * Delete milestone
 */
export async function deleteMilestone(req: Request, res: Response) {
  try {
    const id = req.params.id as string;

    const milestone = await Milestone.findById(id);

    if (!milestone) {
      return errorResponse(res, "Milestone not found", 404);
    }

    const taskCount = await Task.countDocuments({ milestoneId: id });

    if (taskCount > 0) {
      return errorResponse(
        res,
        "Cannot delete milestone with existing tasks. Please remove or reassign tasks first.",
        400
      );
    }

    await Milestone.findByIdAndDelete(id);

    return successResponse(res, null, "Milestone deleted successfully");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * PATCH /api/milestones/:id/status
 * Update milestone status
 */
export async function updateMilestoneStatus(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const { status } = req.body;

    if (!["NOT_STARTED", "IN_PROGRESS", "COMPLETED"].includes(status)) {
      return errorResponse(res, "Invalid status", 400);
    }

    const milestone = await Milestone.findByIdAndUpdate(
      id,
      { $set: { status } },
      { new: true }
    );

    if (!milestone) {
      return errorResponse(res, "Milestone not found", 404);
    }

    const taskCount = await Task.countDocuments({ milestoneId: id });

    return successResponse(res, { ...milestone.toObject(), _count: { tasks: taskCount } }, "Milestone status updated successfully");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}
