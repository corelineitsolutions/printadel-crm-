import { Request, Response } from "express";
import { z } from "zod";
import { leaveService } from "../services/leave.service";
import { LeaveType, LeaveStatus } from "../models/Leave";

/**
 * Leave Controller
 * Handles HTTP requests for leave management
 */

// Validation schemas
const applyLeaveSchema = z.object({
  leaveType: z.enum([
    "SICK",
    "CASUAL",
    "VACATION",
    "WORK_FROM_HOME",
    "UNPAID",
  ]),
  startDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Invalid start date",
  }),
  endDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Invalid end date",
  }),
  isHalfDay: z.boolean().optional(),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
});

const updateLeaveStatusSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  rejectionReason: z.string().optional(),
});

const getLeavesQuerySchema = z.object({
  userId: z.string().optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  leaveType: z
    .enum(["SICK", "CASUAL", "VACATION", "WORK_FROM_HOME", "UNPAID"])
    .optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export const leaveController = {
  /**
   * Apply for leave
   * POST /api/leaves
   */
  async applyLeave(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;

      // Managers and Employees can apply for leave
      if (userRole !== "EMPLOYEE" && userRole !== "MANAGER") {
        return res.status(403).json({
          success: false,
          message: "Only employees and managers are allowed to apply for leave",
        });
      }

      // Validate input
      const validatedData = applyLeaveSchema.parse(req.body);

      // Calculate number of days
      const startDate = new Date(validatedData.startDate);
      const endDate = new Date(validatedData.endDate);

      // Calculate the difference in days
      const timeDiff = endDate.getTime() - startDate.getTime();
      let days = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // +1 to include both start and end dates

      // If it's a half day, set days to 0.5
      if (validatedData.isHalfDay) {
        days = 0.5;
      }

      const leave = await leaveService.applyLeave({
        userId,
        ...validatedData,
        leaveType: validatedData.leaveType as any,
        startDate,
        endDate,
        days,
        isHalfDay: validatedData.isHalfDay || false,
      });

      return res.status(201).json({
        success: true,
        message: "Leave application submitted successfully",
        data: leave,
      });
    } catch (error: any) {
      console.error("Apply leave error:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.errors,
        });
      }

      return res.status(400).json({
        success: false,
        message: error.message || "Failed to apply for leave",
      });
    }
  },

  /**
   * Get all leaves (with filters)
   * GET /api/leaves
   */
  async getLeaves(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;

      // Validate query parameters
      const validatedQuery = getLeavesQuerySchema.parse(req.query);

      const filters = {
        userId: validatedQuery.userId,
        status: validatedQuery.status as LeaveStatus | undefined,
        leaveType: validatedQuery.leaveType as LeaveType | undefined,
        startDate: validatedQuery.startDate
          ? new Date(validatedQuery.startDate)
          : undefined,
        endDate: validatedQuery.endDate
          ? new Date(validatedQuery.endDate)
          : undefined,
        page: validatedQuery.page ? parseInt(validatedQuery.page) : 1,
        limit: validatedQuery.limit ? parseInt(validatedQuery.limit) : 20,
      };

      const result = await leaveService.getLeaves(filters, userId, userRole);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error("Get leaves error:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.errors,
        });
      }

      return res.status(400).json({
        success: false,
        message: error.message || "Failed to fetch leaves",
      });
    }
  },

  /**
   * Get leave by ID
   * GET /api/leaves/:id
   */
  async getLeaveById(req: Request, res: Response) {
    try {
      const leaveId = req.params.id as string;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const leave = await leaveService.getLeaveById(leaveId, userId, userRole);

      return res.json({
        success: true,
        data: leave,
      });
    } catch (error: any) {
      console.error("Get leave by ID error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to fetch leave details",
      });
    }
  },

  /**
   * Update leave status (Approve/Reject)
   * PATCH /api/leaves/:id/status
   * Only Managers and Admins can approve/reject
   */
  async updateLeaveStatus(req: Request, res: Response) {
    try {
      const leaveId = req.params.id as string;
      const approvedBy = req.user!.id;

      // Validate input
      const validatedData = updateLeaveStatusSchema.parse(req.body);

      const leave = await leaveService.updateLeaveStatus({
        leaveId,
        status: validatedData.status as LeaveStatus,
        approvedBy,
        rejectionReason: validatedData.rejectionReason,
      });

      return res.json({
        success: true,
        message: `Leave ${validatedData.status.toLowerCase()} successfully`,
        data: leave,
      });
    } catch (error: any) {
      console.error("Update leave status error:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.errors,
        });
      }

      return res.status(400).json({
        success: false,
        message: error.message || "Failed to update leave status",
      });
    }
  },

  /**
   * Cancel leave
   * DELETE /api/leaves/:id
   */
  async cancelLeave(req: Request, res: Response) {
    try {
      const leaveId = req.params.id as string;
      const userId = req.user!.id;

      const leave = await leaveService.cancelLeave(leaveId, userId);

      return res.json({
        success: true,
        message: "Leave cancelled successfully",
        data: leave,
      });
    } catch (error: any) {
      console.error("Cancel leave error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to cancel leave",
      });
    }
  },

  /**
   * Get my leave balance
   * GET /api/leaves/balance
   */
  async getMyLeaveBalance(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const year = req.query.year
        ? parseInt(req.query.year as string)
        : undefined;

      const balance = await leaveService.getLeaveBalance(userId, year);

      return res.json({
        success: true,
        data: balance,
      });
    } catch (error: any) {
      console.error("Get leave balance error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to fetch leave balance",
      });
    }
  },

  /**
   * Get user leave balance (Admin/Manager)
   * GET /api/leaves/balance/:userId
   */
  async getUserLeaveBalance(req: Request, res: Response) {
    try {
      const userId = req.params.userId as string;
      const year = req.query.year
        ? parseInt(req.query.year as string)
        : undefined;

      const balance = await leaveService.getLeaveBalance(userId, year);

      return res.json({
        success: true,
        data: balance,
      });
    } catch (error: any) {
      console.error("Get user leave balance error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to fetch leave balance",
      });
    }
  },

  /**
   * Get leave statistics
   * GET /api/leaves/stats
   */
  async getLeaveStats(req: Request, res: Response) {
    try {
      const userRole = req.user!.role;
      const userId =
        userRole === "EMPLOYEE" ? req.user!.id : req.query.userId as string | undefined;

      const stats = await leaveService.getLeaveStats(userId);

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      console.error("Get leave stats error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to fetch leave statistics",
      });
    }
  },
};
