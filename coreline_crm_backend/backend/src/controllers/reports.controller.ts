import { Request, Response } from "express";
import { z } from "zod";
import reportsService from "../services/reports.service";
import { successResponse, errorResponse } from "../utils/response.utils";

/**
 * Reports Controller
 * Handles reporting and analytics HTTP requests
 */

// ==================== Validation Schemas ====================

const dateRangeSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  departmentFilter: z.string().optional(),
  userId: z.string().optional(),
});

// ==================== Controllers ====================

/**
 * GET /api/reports/attendance
 * Get attendance report
 */
export async function handleAttendanceReport(req: Request, res: Response) {
  try {
    const { startDate, endDate, departmentFilter, userId: queryUserId } = dateRangeSchema.parse(req.query);
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Determine target userId for the service
    // If queryUserId is 'all', treat as undefined (show all for Admin/Manager)
    let targetUserId: string | undefined = queryUserId && queryUserId !== "all" ? queryUserId : undefined;

    // For Employees, always restrict to their own ID
    if (userRole === "EMPLOYEE") {
      targetUserId = userId;
    }

    const report = await reportsService.getAttendanceReport(
      new Date(startDate),
      new Date(endDate),
      departmentFilter,
      userRole,
      targetUserId
    );

    return successResponse(res, report, "Attendance report generated", 200);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/reports/tasks
 * Get task completion report
 */
export async function handleTaskCompletionReport(req: Request, res: Response) {
  try {
    const { startDate, endDate, userId: queryUserId } = dateRangeSchema.parse(req.query);
    const projectId = req.query.projectId as string;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    let targetUserId: string | undefined = queryUserId && queryUserId !== "all" ? queryUserId : undefined;
    if (userRole === "EMPLOYEE") targetUserId = userId;

    const report = await reportsService.getTaskCompletionReport(
      new Date(startDate),
      new Date(endDate),
      projectId,
      userRole,
      targetUserId
    );

    return successResponse(res, report, "Task report generated", 200);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/reports/leave
 * Get leave report
 */
export async function handleLeaveReport(req: Request, res: Response) {
  try {
    const { startDate, endDate, departmentFilter, userId: queryUserId } = dateRangeSchema.parse(req.query);
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    let targetUserId: string | undefined = queryUserId && queryUserId !== "all" ? queryUserId : undefined;
    if (userRole === "EMPLOYEE") targetUserId = userId;

    const report = await reportsService.getLeaveReport(
      new Date(startDate),
      new Date(endDate),
      departmentFilter,
      userRole,
      targetUserId
    );

    return successResponse(res, report, "Leave report generated", 200);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/reports/payroll
 * Get payroll report
 */
export async function handlePayrollReport(req: Request, res: Response) {
  try {
    const month = parseInt(req.query.month as string);
    const year = parseInt(req.query.year as string);
    const departmentFilter = req.query.departmentFilter as string || req.query.department as string;
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const queryUserId = req.query.userId as string;

    let targetUserId: string | undefined = queryUserId && queryUserId !== "all" ? queryUserId : undefined;
    if (userRole === "EMPLOYEE") {
      targetUserId = userId;
    }

    const report = await reportsService.getPayrollReport(month, year, departmentFilter, targetUserId);

    return successResponse(res, report, "Payroll report generated", 200);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/reports/employee-productivity/:id
 * Get employee productivity report
 */
export async function handleEmployeeProductivityReport(req: Request, res: Response) {
  try {
    const employeeId = req.params.id as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const report = await reportsService.getEmployeeProductivityReport(
      employeeId,
      new Date(startDate),
      new Date(endDate)
    );

    return successResponse(res, report, "Productivity report generated", 200);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/reports/dashboard-analytics
 * Get dashboard analytics
 */
export async function handleDashboardAnalytics(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const analytics = await reportsService.getDashboardAnalytics(userId, userRole);
    return successResponse(res, analytics, "Analytics retrieved successfully", 200);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}
