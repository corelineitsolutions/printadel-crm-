import { Request, Response } from "express";
import {
  punchIn,
  punchOut,
  startBreak,
  endBreak,
  getMyAttendance,
  getTeamAttendance,
  getTodayAttendance,
  requestAttendanceCorrection,
  getCorrectionRequests,
  handleCorrectionApproval,
  assignWFH,
  getWFHAssignments,
  deactivateWFH,
  updateAttendanceStatus,
  toggleOvertime,
  getOvertimeRecords,
} from "../services/attendance.service";
import { CorrectionStatus } from "../models/AttendanceCorrection";
import { successResponse, errorResponse } from "../utils/response.utils";
import { z } from "zod";

/**
 * Attendance Controller
 * Handles attendance-related HTTP requests
 */

// ==================== Validation Schemas ====================

const correctionSchema = z.object({
  attendanceId: z.string().nullable().optional(),
  date: z.string().min(1, "Date is required"),
  reason: z.string().min(5, "Reason must be at least 5 characters"),
  requestedPunchIn: z.string().nullable().optional(),
  requestedPunchOut: z.string().nullable().optional(),
});

const handleCorrectionSchema = z.object({
  status: z.enum([CorrectionStatus.APPROVED, CorrectionStatus.REJECTED]),
  adminNotes: z.string().optional(),
});

const assignWFHSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  reason: z.string().optional(),
});

const punchInSchema = z.object({
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string().optional(),
  }),
  isWFH: z.boolean().optional(),
  isOvertime: z.boolean().optional(),
});

const punchOutSchema = z.object({
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string().optional(),
  }),
  workSummary: z.string().optional(),
  workImages: z.array(z.string()).optional(),
});



// ==================== Controllers ====================

/**
 * POST /api/attendance/punch-in
 * Punch in for the day
 */
export async function handlePunchIn(req: Request, res: Response) {
  try {
    if (!req.user) {
      return errorResponse(res, "User not authenticated", 401);
    }

    const { location, isWFH, isOvertime } = punchInSchema.parse(req.body);
    const attendance = await punchIn(req.user.userId, location, isWFH, isOvertime);

    return successResponse(res, attendance, "Punched in successfully", 201);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * POST /api/attendance/punch-out
 * Punch out for the day
 */
export async function handlePunchOut(req: Request, res: Response) {
  try {
    if (!req.user) {
      return errorResponse(res, "User not authenticated", 401);
    }

    const { location, workSummary, workImages } = punchOutSchema.parse(req.body);
    const attendance = await punchOut(req.user.userId, location, workSummary, workImages);

    return successResponse(res, attendance, "Punched out successfully");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * POST /api/attendance/start-break
 * Start break
 */
export async function handleStartBreak(req: Request, res: Response) {
  try {
    if (!req.user) {
      return errorResponse(res, "User not authenticated", 401);
    }

    const result = await startBreak(req.user.userId);
    return successResponse(res, result, "Break started");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * POST /api/attendance/end-break
 * End break
 */
export async function handleEndBreak(req: Request, res: Response) {
  try {
    if (!req.user) {
      return errorResponse(res, "User not authenticated", 401);
    }

    const result = await endBreak(req.user.userId);
    return successResponse(res, result, "Break ended");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/attendance/my-attendance
 * Get my attendance records
 */
export async function handleGetMyAttendance(req: Request, res: Response) {
  try {
    if (!req.user) {
      return errorResponse(res, "User not authenticated", 401);
    }

    const month = req.query.month ? parseInt(req.query.month as string) : undefined;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;

    const result = await getMyAttendance(req.user.userId, month, year);
    return successResponse(res, result, "Attendance records retrieved");
  } catch (error: any) {
    return errorResponse(res, error.message);
  }
}

/**
 * GET /api/attendance/team-attendance
 * Get team attendance (Manager only)
 */
export async function handleGetTeamAttendance(req: Request, res: Response) {
  try {
    if (!req.user) {
      return errorResponse(res, "User not authenticated", 401);
    }

    const month = req.query.month ? parseInt(req.query.month as string) : undefined;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;

    const result = await getTeamAttendance(req.user.userId, month, year);
    return successResponse(res, result, "Team attendance retrieved");
  } catch (error: any) {
    return errorResponse(res, error.message);
  }
}

/**
 * GET /api/attendance/today
 * Get today's attendance status
 */
export async function handleGetTodayAttendance(req: Request, res: Response) {
  try {
    if (!req.user) {
      return errorResponse(res, "User not authenticated", 401);
    }

    const attendance = await getTodayAttendance(req.user.userId);
    return successResponse(res, attendance, "Today's attendance retrieved");
  } catch (error: any) {
    return errorResponse(res, error.message);
  }
}

/**
 * POST /api/attendance/correction-request
 * Request attendance correction
 */
export async function handleCorrectionRequest(req: Request, res: Response) {
  try {
    if (!req.user) {
      return errorResponse(res, "User not authenticated", 401);
    }

    const { attendanceId, reason, date, requestedPunchIn, requestedPunchOut } = correctionSchema.parse(req.body);
    const result = await requestAttendanceCorrection(
      req.user.userId,
      attendanceId || undefined,
      reason,
      date,
      requestedPunchIn || undefined,
      requestedPunchOut || undefined
    );

    return successResponse(res, result, "Correction request submitted");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/attendance/corrections
 * Get all correction requests (Admin/Manager)
 */
export async function handleGetCorrections(req: Request, res: Response) {
  try {
    const status = req.query.status as any;
    const userId = req.query.userId as string;

    const result = await getCorrectionRequests(status, userId);
    return successResponse(res, result, "Correction requests retrieved");
  } catch (error: any) {
    return errorResponse(res, error.message);
  }
}

/**
 * PUT /api/attendance/corrections/:id
 * Approve/Reject correction request (Admin/Manager)
 */
export async function handleApproveCorrection(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const { status, adminNotes } = handleCorrectionSchema.parse(req.body);

    const result = await handleCorrectionApproval(
      id,
      req.user!.userId,
      status,
      adminNotes
    );

    return successResponse(res, result, `Correction request ${status.toLowerCase()}`);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}
/**
 * POST /api/attendance/wfh
 * Assign WFH to employee
 */
export async function handleAssignWFH(req: Request, res: Response) {
  try {
    const data = assignWFHSchema.parse(req.body);
    const result = await assignWFH(
      data.userId,
      req.user!.userId,
      data.startDate,
      data.endDate,
      data.reason
    );
    return successResponse(res, result, "WFH assigned successfully");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/attendance/wfh
 * Get WFH assignments
 */
export async function handleGetWFH(req: Request, res: Response) {
  try {
    const userId = req.query.userId as string;
    const result = await getWFHAssignments(userId);
    return successResponse(res, result, "WFH assignments retrieved");
  } catch (error: any) {
    return errorResponse(res, error.message);
  }
}

/**
 * DELETE /api/attendance/wfh/:id
 * Deactivate WFH assignment
 */
export async function handleDeactivateWFH(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const result = await deactivateWFH(id);
    return successResponse(res, result, "WFH assignment deactivated");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * PATCH /api/attendance/:id/status
 * Manually update attendance status
 */
export async function handleUpdateStatus(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const { status, date, userId } = req.body;
    
    // id could be a virtual missing record ID "vabsent_..." which is caught in service
    const sanitizedId = (id.startsWith('v')) ? undefined : id;
    const approverId = req.user!.userId;

    const result = await updateAttendanceStatus(sanitizedId, date, userId, status, approverId);
    return successResponse(res, result, "Attendance status updated successfully");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * PATCH /api/attendance/toggle-overtime
 * Toggle overtime for today's session
 */
export async function handleToggleOvertime(req: Request, res: Response) {
  try {
    if (!req.user) {
      return errorResponse(res, "User not authenticated", 401);
    }

    const { isOvertime } = req.body;
    const result = await toggleOvertime(req.user.userId, isOvertime);
    return successResponse(res, result, `Overtime toggled ${isOvertime ? 'ON' : 'OFF'}`);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/attendance/overtime
 * Get overtime tracking records
 */
export async function handleGetOvertime(req: Request, res: Response) {
  try {
    if (!req.user) {
      return errorResponse(res, "User not authenticated", 401);
    }

    const userId = req.user.userId || req.user.id;
    const userRole = req.user.role;

    const filters = {
      employeeId: req.query.employeeId as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      month: req.query.month ? parseInt(req.query.month as string, 10) : undefined,
      year: req.query.year ? parseInt(req.query.year as string, 10) : undefined,
    };

    const result = await getOvertimeRecords(userId, userRole, filters);
    return successResponse(res, result, "Overtime records retrieved successfully");
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
}

