import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { requireRoles } from "../middleware/role.middleware";
import { UserRole } from "../models/User";
import {
  handleAttendanceReport,
  handleTaskCompletionReport,
  handleLeaveReport,
  handlePayrollReport,
  handleEmployeeProductivityReport,
  handleDashboardAnalytics,
} from "../controllers/reports.controller";

const router = Router();

/**
 * Reports Routes
 * Base path: /api/reports
 */

// All routes require authentication
router.use(authenticate);

// Dashboard analytics - All authenticated users
router.get("/dashboard-analytics", handleDashboardAnalytics);

// Attendance report - All authenticated users (role-based filtering in service)
router.get("/attendance", handleAttendanceReport);

// Task completion report - All authenticated users
router.get("/tasks", handleTaskCompletionReport);

// Leave report - All authenticated users
router.get("/leave", handleLeaveReport);

// Payroll report - ADMIN, MANAGER only
router.get("/payroll", requireRoles(UserRole.ADMIN, UserRole.MANAGER), handlePayrollReport);

// Employee productivity report - ADMIN, MANAGER only
router.get(
  "/employee-productivity/:id",
  requireRoles(UserRole.ADMIN, UserRole.MANAGER),
  handleEmployeeProductivityReport
);

export default router;
