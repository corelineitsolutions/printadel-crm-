import { Request, Response } from "express";
import { z } from "zod";
import { projectService } from "../services/project.service";
import { ProjectStatus } from "../models/Project";

/**
 * Project Controller
 * Handles HTTP requests for project management
 */

// Validation schemas
const createProjectSchema = z.object({
  name: z.string().min(3, "Project name must be at least 3 characters"),
  code: z.string().min(2, "Project code must be at least 2 characters").max(20),
  description: z.string().optional(),
  requirements: z.string().optional(),
  clientName: z.string().optional(),
  startDate: z.string().optional(),
  deadline: z.string().optional(),
  budget: z.number().positive().optional(),
  memberIds: z.array(z.string()).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(3).optional(),
  description: z.string().optional(),
  requirements: z.string().optional(),
  clientName: z.string().optional(),
  startDate: z.string().optional(),
  deadline: z.string().optional(),
  budget: z.any().optional(),
  status: z.enum(["PLANNING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]).optional(),
  memberIds: z.array(z.string()).optional(),
});

const getProjectsQuerySchema = z.object({
  status: z.enum(["PLANNING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]).optional(),
  search: z.string().optional(),
  createdBy: z.string().optional(),
  memberId: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

const addMembersSchema = z.object({
  memberIds: z.array(z.string()).min(1, "At least one member is required"),
});

export const projectController = {
  /**
   * Create project
   * POST /api/projects
   */
  async createProject(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const validatedData = createProjectSchema.parse(req.body);

      const project = await projectService.createProject({
        ...validatedData,
        createdBy: userId,
        startDate: validatedData.startDate
          ? new Date(validatedData.startDate)
          : undefined,
        deadline: validatedData.deadline
          ? new Date(validatedData.deadline)
          : undefined,
      });

      return res.status(201).json({
        success: true,
        message: "Project created successfully",
        data: project,
      });
    } catch (error: any) {
      console.error("Create project error:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.errors,
        });
      }

      return res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to create project",
      });
    }
  },

  /**
   * Get all projects
   * GET /api/projects
   */
  async getProjects(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const validatedQuery = getProjectsQuerySchema.parse(req.query);

      const filters = {
        status: validatedQuery.status as ProjectStatus | undefined,
        search: validatedQuery.search,
        createdBy: validatedQuery.createdBy,
        memberId: validatedQuery.memberId,
        page: validatedQuery.page ? parseInt(validatedQuery.page) : 1,
        limit: validatedQuery.limit ? parseInt(validatedQuery.limit) : 20,
      };

      const result = await projectService.getProjects(filters, userId, userRole);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error("Get projects error:", error instanceof Error ? error.message : String(error));
      return res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to fetch projects",
      });
    }
  },

  /**
   * Get project by ID
   * GET /api/projects/:id
   */
  async getProjectById(req: Request, res: Response) {
    try {
      const projectId = req.params.id as string;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const project = await projectService.getProjectById(
        projectId,
        userId,
        userRole
      );

      return res.json({
        success: true,
        data: project,
      });
    } catch (error: any) {
      console.error("Get project error:", error instanceof Error ? error.message : String(error));
      return res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to fetch project",
      });
    }
  },

  /**
   * Update project
   * PUT /api/projects/:id
   */
  async updateProject(req: Request, res: Response) {
    try {
      const projectId = req.params.id as string;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const validatedData = updateProjectSchema.parse(req.body);

      const { memberIds, ...updateData } = validatedData;

      const project = await projectService.updateProject(
        projectId,
        {
          ...updateData,
          status: validatedData.status as any,
          startDate: validatedData.startDate
            ? new Date(validatedData.startDate)
            : undefined,
          deadline: validatedData.deadline
            ? new Date(validatedData.deadline)
            : undefined,
          budget: (validatedData.budget !== undefined && validatedData.budget !== "")
            ? parseFloat(validatedData.budget.toString())
            : undefined,
          memberIds: validatedData.memberIds,
        },
        userId,
        userRole
      );

      return res.json({
        success: true,
        message: "Project updated successfully",
        data: project,
      });
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Update project error:", errorMessage);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.errors,
        });
      }

      return res.status(400).json({
        success: false,
        message: error.message || "Failed to update project",
      });
    }
  },

  /**
   * Delete project
   * DELETE /api/projects/:id
   */
  async deleteProject(req: Request, res: Response) {
    try {
      const projectId = req.params.id as string;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const result = await projectService.deleteProject(
        projectId,
        userId,
        userRole
      );

      return res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error("Delete project error:", error instanceof Error ? error.message : String(error));
      return res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to delete project",
      });
    }
  },

  /**
   * Add members to project
   * POST /api/projects/:id/members
   */
  async addMembers(req: Request, res: Response) {
    try {
      const projectId = req.params.id as string;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const validatedData = addMembersSchema.parse(req.body);

      const project = await projectService.addProjectMembers(
        projectId,
        validatedData.memberIds,
        userId,
        userRole
      );

      return res.json({
        success: true,
        message: "Members added successfully",
        data: project,
      });
    } catch (error: any) {
      console.error("Add members error:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.errors,
        });
      }

      return res.status(400).json({
        success: false,
        message: error.message || "Failed to add members",
      });
    }
  },

  /**
   * Remove member from project
   * DELETE /api/projects/:id/members/:memberId
   */
  async removeMember(req: Request, res: Response) {
    try {
      const { id: projectId, memberId } = req.params as any;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const project = await projectService.removeProjectMember(
        projectId,
        memberId,
        userId,
        userRole
      );

      return res.json({
        success: true,
        message: "Member removed successfully",
        data: project,
      });
    } catch (error: any) {
      console.error("Remove member error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to remove member",
      });
    }
  },

  /**
   * Get project statistics
   * GET /api/projects/stats
   */
  async getStats(req: Request, res: Response) {
    try {
      const projectId = req.query.projectId as string | undefined;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const stats = await projectService.getProjectStats(userId, userRole, projectId);

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      console.error("Get project stats error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to fetch statistics",
      });
    }
  },
};
