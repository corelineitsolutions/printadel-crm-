import { Request, Response } from "express";
import { z } from "zod";
import {
  generatePayroll,
  processPayroll,
  markPayrollAsPaid,
  bulkGeneratePayroll,
  getPayrollById,
  getPayrolls,
  getPayrollStatistics,
  calculatePayroll,
} from "../services/payroll.service";
import { successResponse, errorResponse } from "../utils/response.utils";

/**
 * Payroll Controller
 * Handles payroll-related HTTP requests
 */

// ==================== Validation Schemas ====================

const generatePayrollSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000),
});

const bulkGenerateSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000),
});



// ==================== Controllers ====================

/**
 * POST /api/payroll/generate
 * Generate payroll for a specific user and month
 */
export async function handleGeneratePayroll(req: Request, res: Response) {
  try {
    const { userId, month, year } = generatePayrollSchema.parse(req.body);

    const payroll = await generatePayroll(userId, month, year);

    return successResponse(
      res,
      payroll,
      "Payroll generated successfully",
      200
    );
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * POST /api/payroll/bulk-generate
 * Bulk generate payroll for all active employees
 */
export async function handleBulkGeneratePayroll(req: Request, res: Response) {
  try {
    const { month, year } = bulkGenerateSchema.parse(req.body);

    const results = await bulkGeneratePayroll(month, year);

    return successResponse(
      res,
      results,
      `Bulk payroll generated: ${results.success.length} successful, ${results.failed.length} failed`,
      200
    );
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * POST /api/payroll/:id/process
 * Process payroll (mark as processed)
 */
export async function handleProcessPayroll(req: Request, res: Response) {
  try {
    const payrollId = req.params.id as string;
    const processedBy = req.user!.userId;

    const payroll = await processPayroll(payrollId, processedBy);

    return successResponse(
      res,
      payroll,
      "Payroll processed successfully",
      200
    );
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * POST /api/payroll/:id/mark-paid
 * Mark payroll as paid
 */
export async function handleMarkPayrollAsPaid(req: Request, res: Response) {
  try {
    const payrollId = req.params.id as string;
    const processedBy = req.user!.userId;

    const payroll = await markPayrollAsPaid(payrollId, processedBy);

    return successResponse(res, payroll, "Payroll marked as paid", 200);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/payroll/:id
 * Get payroll by ID (payslip view)
 */
export async function handleGetPayrollById(req: Request, res: Response) {
  try {
    const payrollId = req.params.id as string;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    const payroll = await getPayrollById(payrollId, userId, userRole);

    return successResponse(res, payroll, "Payroll retrieved successfully", 200);
  } catch (error: any) {
    return errorResponse(res, error.message, error.message.includes("Unauthorized") ? 403 : 404);
  }
}

/**
 * GET /api/payroll
 * Get payrolls with filters
 */
export async function handleGetPayrolls(req: Request, res: Response) {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    const month = typeof req.query.month === 'string' ? parseInt(req.query.month) : undefined;
    const year = typeof req.query.year === 'string' ? parseInt(req.query.year) : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const employeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined;

    const filters = {
      month,
      year,
      status: status as any,
      employeeId,
    };

    const payrolls = await getPayrolls(userId, userRole, filters);

    return successResponse(res, payrolls, "Payrolls retrieved successfully", 200);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/payroll/statistics
 * Get payroll statistics
 */
export async function handleGetPayrollStatistics(req: Request, res: Response) {
  try {
    const month = typeof req.query.month === 'string' ? parseInt(req.query.month) : undefined;
    const year = typeof req.query.year === 'string' ? parseInt(req.query.year) : undefined;

    const statistics = await getPayrollStatistics(month, year);

    return successResponse(res, statistics, "Statistics retrieved successfully", 200);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * POST /api/payroll/calculate
 * Calculate payroll preview (without saving)
 */
export async function handleCalculatePayroll(req: Request, res: Response) {
  try {
    const { userId, month, year } = generatePayrollSchema.parse(req.body);

    const calculation = await calculatePayroll(userId, month, year);

    return successResponse(res, calculation, "Payroll calculated successfully", 200);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}
