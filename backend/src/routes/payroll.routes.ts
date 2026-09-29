import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { requireRoles } from "../middleware/role.middleware";
import { UserRole } from "../models/User";
import {
  handleGeneratePayroll,
  handleBulkGeneratePayroll,
  handleProcessPayroll,
  handleMarkPayrollAsPaid,
  handleGetPayrollById,
  handleGetPayrolls,
  handleGetPayrollStatistics,
  handleCalculatePayroll,
} from "../controllers/payroll.controller";

const router = Router();

/**
 * Payroll Routes
 * Base path: /api/payroll
 */

// All routes require authentication
router.use(authenticate);

// Calculate payroll preview (without saving) - ADMIN, MANAGER
router.post("/calculate", requireRoles(UserRole.ADMIN, UserRole.MANAGER), handleCalculatePayroll);

// Generate payroll for specific employee - ADMIN, MANAGER
router.post("/generate", requireRoles(UserRole.ADMIN, UserRole.MANAGER), handleGeneratePayroll);

// Bulk generate payroll for all employees - ADMIN, MANAGER
router.post("/bulk-generate", requireRoles(UserRole.ADMIN, UserRole.MANAGER), handleBulkGeneratePayroll);

// Get payroll statistics - ADMIN, MANAGER
router.get("/statistics", requireRoles(UserRole.ADMIN, UserRole.MANAGER), handleGetPayrollStatistics);

// Get all payrolls with filters - All authenticated users
router.get("/", handleGetPayrolls);

// Get specific payroll by ID (payslip) - All authenticated users
router.get("/:id", handleGetPayrollById);

// Process payroll (mark as processed) - ADMIN, MANAGER
router.post("/:id/process", requireRoles(UserRole.ADMIN, UserRole.MANAGER), handleProcessPayroll);

// Mark payroll as paid - ADMIN, MANAGER
router.post("/:id/mark-paid", requireRoles(UserRole.ADMIN, UserRole.MANAGER), handleMarkPayrollAsPaid);

export default router;
