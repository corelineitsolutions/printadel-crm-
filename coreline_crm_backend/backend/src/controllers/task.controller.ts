import { Request, Response } from "express";
import { z } from "zod";
import { taskService } from "../services/task.service";

/**
 * Task Controller
 * Handles HTTP requests for task management, timers, comments, and subtasks
 */

// Validation schemas
const createTaskSchema = z.object({
  title: z.string().min(3, "Task title must be at least 3 characters"),
  description: z.string().optional(),
  projectId: z.string().optional(),
  milestoneId: z.string().optional(),
  assignedTo: z.union([z.string(), z.array(z.string())]).refine(
    (val) => (Array.isArray(val) ? val.length > 0 : val.length > 0),
    { message: "At least one assignee is required" }
  ),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  estimatedHours: z.number().positive().optional(),
  deadline: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isSelfCreated: z.boolean().optional(),
  taskImages: z.array(z.string()).optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  projectId: z.string().optional(),
  milestoneId: z.string().optional(),
  assignedTo: z.union([z.string(), z.array(z.string())]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  status: z.enum(["TO_DO", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETED", "REJECTED"]).optional(),
  estimatedHours: z.any().optional(),
  deadline: z.string().optional(),
  tags: z.array(z.string()).optional(),
  taskImages: z.array(z.string()).optional(),
});

const getTasksQuerySchema = z.object({
  projectId: z.string().optional(),
  milestoneId: z.string().optional(),
  assignedTo: z.string().optional(),
  assignedBy: z.string().optional(),
  status: z.enum(["TO_DO", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETED", "REJECTED", "ACTIVE_ALL"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  search: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
  taskType: z.enum(["self", "assigned", "overall", "collaboration", "my-tasks"]).optional(),
});

const addCommentSchema = z.object({
  comment: z.string().min(1, "Comment cannot be empty"),
  isFeedback: z.boolean().optional(),
});

const createSubtaskSchema = z.object({
  title: z.string().min(1, "Subtask title is required"),
  description: z.string().optional(),
});

const updateSubtaskSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  isCompleted: z.boolean().optional(),
});

const reportBlockerSchema = z.object({
  reason: z.string().min(5, "Reason must be at least 5 characters"),
});

export const taskController = {
  /**
   * Create task
   * POST /api/tasks
   */
  async createTask(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const validatedData = createTaskSchema.parse(req.body);

      const task = await taskService.createTask({
        ...validatedData,
        assignedBy: userId,
        priority: validatedData.priority as any,
        deadline: validatedData.deadline
          ? new Date(validatedData.deadline)
          : undefined,
      });

      return res.status(201).json({
        success: true,
        message: "Task created successfully",
        data: task,
      });
    } catch (error: any) {
      console.error("Create task error:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.errors,
        });
      }

      return res.status(400).json({
        success: false,
        message: error.message || "Failed to create task",
      });
    }
  },

  /**
   * Get all tasks
   * GET /api/tasks
   */
  async getTasks(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const validatedQuery = getTasksQuerySchema.parse(req.query);

      const filters = {
        projectId: validatedQuery.projectId,
        milestoneId: validatedQuery.milestoneId,
        assignedTo: validatedQuery.assignedTo,
        assignedBy: validatedQuery.assignedBy,
        status: validatedQuery.status as any,
        priority: validatedQuery.priority as any,
        search: validatedQuery.search,
        page: validatedQuery.page ? parseInt(validatedQuery.page) : 1,
        limit: validatedQuery.limit ? parseInt(validatedQuery.limit) : 50,
        taskType: validatedQuery.taskType as any,
      };

      const result = await taskService.getTasks(filters, userId, userRole);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error("Get tasks error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to fetch tasks",
      });
    }
  },

  /**
   * Get task by ID
   * GET /api/tasks/:id
   */
  async getTaskById(req: Request, res: Response) {
    try {
      const taskId = req.params.id as string;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const task = await taskService.getTaskById(taskId, userId, userRole);

      return res.json({
        success: true,
        data: task,
      });
    } catch (error: any) {
      console.error("Get task error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to fetch task",
      });
    }
  },

  /**
   * Update task
   * PUT /api/tasks/:id
   */
  async updateTask(req: Request, res: Response) {
    try {
      const taskId = req.params.id as string;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const validatedData = updateTaskSchema.parse(req.body);

      const task = await taskService.updateTask(
        taskId,
        {
          ...validatedData,
          priority: validatedData.priority as any,
          status: validatedData.status as any,
          deadline: (validatedData.deadline !== undefined && validatedData.deadline !== "")
            ? new Date(validatedData.deadline)
            : undefined,
          estimatedHours: (validatedData.estimatedHours !== undefined && validatedData.estimatedHours !== "")
            ? parseFloat(validatedData.estimatedHours.toString())
            : undefined,
          assignedTo: validatedData.assignedTo,
        },
        userId,
        userRole
      );

      return res.json({
        success: true,
        message: "Task updated successfully",
        data: task,
      });
    } catch (error: any) {
      console.error("Update task error:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.errors,
        });
      }

      return res.status(400).json({
        success: false,
        message: error.message || "Failed to update task",
      });
    }
  },

  /**
   * Delete task
   * DELETE /api/tasks/:id
   */
  async deleteTask(req: Request, res: Response) {
    try {
      const taskId = req.params.id as string;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const result = await taskService.deleteTask(taskId, userId, userRole);

      return res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error("Delete task error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to delete task",
      });
    }
  },

  /**
   * Start task timer
   * POST /api/tasks/:id/timer/start
   */
  async startTimer(req: Request, res: Response) {
    try {
      const taskId = req.params.id as string;
      const userId = req.user!.id;

      const timer = await taskService.startTimer(taskId, userId);

      return res.json({
        success: true,
        message: "Timer started successfully",
        data: timer,
      });
    } catch (error: any) {
      console.error("Start timer error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to start timer",
      });
    }
  },

  /**
   * Stop task timer
   * POST /api/tasks/timer/:timerId/stop
   */
  async stopTimer(req: Request, res: Response) {
    try {
      const timerId = req.params.timerId as string;
      const userId = req.user!.id;
      const { notes } = req.body;

      const timer = await taskService.stopTimer(timerId, userId, notes);

      return res.json({
        success: true,
        message: "Timer stopped successfully",
        data: timer,
      });
    } catch (error: any) {
      console.error("Stop timer error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to stop timer",
      });
    }
  },

  /**
   * Get active timer
   * GET /api/tasks/timer/active
   */
  async getActiveTimer(req: Request, res: Response) {
    try {
      const userId = req.user!.id;

      const timer = await taskService.getActiveTimer(userId);

      return res.json({
        success: true,
        data: timer,
      });
    } catch (error: any) {
      console.error("Get active timer error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to fetch active timer",
      });
    }
  },

  /**
   * Add comment to task
   * POST /api/tasks/:id/comments
   */
  async addComment(req: Request, res: Response) {
    try {
      const taskId = req.params.id as string;
      const userId = req.user!.id;

      const validatedData = addCommentSchema.parse(req.body);
      const userRole = req.user!.role;

      // Automatically mark as feedback if manager/admin and not explicitly set
      const isFeedback = validatedData.isFeedback ?? (userRole === "ADMIN" || userRole === "MANAGER");

      const comment = await taskService.addComment(
        taskId,
        userId,
        validatedData.comment,
        isFeedback
      );

      return res.status(201).json({
        success: true,
        message: "Comment added successfully",
        data: comment,
      });
    } catch (error: any) {
      console.error("Add comment error:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.errors,
        });
      }

      return res.status(400).json({
        success: false,
        message: error.message || "Failed to add comment",
      });
    }
  },

  /**
   * Pause timer
   * POST /api/tasks/timer/:timerId/pause
   */
  async pauseTimer(req: Request, res: Response) {
    try {
      const timerId = req.params.timerId as string;
      const userId = req.user!.id;

      const timer = await taskService.pauseTimer(timerId, userId);

      return res.json({
        success: true,
        message: "Timer paused successfully",
        data: timer,
      });
    } catch (error: any) {
      console.error("Pause timer error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to pause timer",
      });
    }
  },

  /**
   * Resume timer
   * POST /api/tasks/timer/:timerId/resume
   */
  async resumeTimer(req: Request, res: Response) {
    try {
      const timerId = req.params.timerId as string;
      const userId = req.user!.id;

      const timer = await taskService.resumeTimer(timerId, userId);

      return res.json({
        success: true,
        message: "Timer resumed successfully",
        data: timer,
      });
    } catch (error: any) {
      console.error("Resume timer error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to resume timer",
      });
    }
  },

  /**
   * Create subtask
   * POST /api/tasks/:id/subtasks
   */
  async createSubtask(req: Request, res: Response) {
    try {
      const taskId = req.params.id as string;
      const userId = req.user!.id;

      const validatedData = createSubtaskSchema.parse(req.body);

      const subtask = await taskService.createSubtask(
        taskId,
        validatedData.title,
        validatedData.description,
        userId,
        req.user!.role
      );

      return res.status(201).json({
        success: true,
        message: "Subtask created successfully",
        data: subtask,
      });
    } catch (error: any) {
      console.error("Create subtask error:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.errors,
        });
      }

      return res.status(400).json({
        success: false,
        message: error.message || "Failed to create subtask",
      });
    }
  },

  /**
   * Update subtask
   * PUT /api/tasks/subtasks/:subtaskId
   */
  async updateSubtask(req: Request, res: Response) {
    try {
      const subtaskId = req.params.subtaskId as string;

      const validatedData = updateSubtaskSchema.parse(req.body);

      const subtask = await taskService.updateSubtask(
        subtaskId,
        validatedData,
        req.user!.id,
        req.user!.role
      );

      return res.json({
        success: true,
        message: "Subtask updated successfully",
        data: subtask,
      });
    } catch (error: any) {
      console.error("Update subtask error:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.errors,
        });
      }

      return res.status(400).json({
        success: false,
        message: error.message || "Failed to update subtask",
      });
    }
  },

  /**
   * Delete subtask
   * DELETE /api/tasks/subtasks/:subtaskId
   */
  async deleteSubtask(req: Request, res: Response) {
    try {
      const subtaskId = req.params.subtaskId as string;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const result = await taskService.deleteSubtask(subtaskId, userId, userRole);

      return res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error("Delete subtask error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to delete subtask",
      });
    }
  },

  /**
   * Get task statistics
   * GET /api/tasks/stats
   */
  async getStats(req: Request, res: Response) {
    try {
      const userId = (req.query.userId as string) || req.user?.id;
      const projectId = req.query.projectId as string | undefined;

      const userRole = req.user!.role;
      const stats = await taskService.getTaskStats(userId, projectId, userRole);

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      console.error("Get task stats error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to fetch statistics",
      });
    }
  },

  /**
   * Get my tasks
   * GET /api/tasks/my-tasks
   */
  async getMyTasks(req: Request, res: Response) {
    try {
      const userId = req.user!.id;

      const tasks = await taskService.getMyTasks(userId);

      return res.json({
        success: true,
        data: tasks,
      });
    } catch (error: any) {
      console.error("Get my tasks error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to fetch tasks",
      });
    }
  },
  /**
   * Report task blocker
   * POST /api/tasks/:id/block
   */
  async reportBlocker(req: Request, res: Response) {
    try {
      const taskId = req.params.id as string;
      const userId = req.user!.id;
      const { reason } = reportBlockerSchema.parse(req.body);

      const task = await taskService.reportBlocker(taskId, userId, reason);

      return res.json({
        success: true,
        message: "Blocker reported successfully",
        data: task,
      });
    } catch (error: any) {
      console.error("Report blocker error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to report blocker",
      });
    }
  },

  /**
   * Resolve task blocker
   * POST /api/tasks/:id/unblock
   */
  async resolveBlocker(req: Request, res: Response) {
    try {
      const taskId = req.params.id as string;
      const userId = req.user!.id;

      const task = await taskService.resolveBlocker(taskId, userId);

      return res.json({
        success: true,
        message: "Blocker resolved successfully",
        data: task,
      });
    } catch (error: any) {
      console.error("Resolve blocker error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to resolve blocker",
      });
    }
  },
};
