import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { requireSalaryAccess } from "../middleware/role.middleware";
import {
  handleGeneratePayroll,
  handleBulkGeneratePayroll,
  handleProcessPayroll,
  handleMarkPayrollAsPaid,
  handleGetPayrollById,
  handleGetPayrolls,
  handleGetPayrollStatistics,
  handleCalculatePayroll,
  handleUpdateSalarySheet,
} from "../controllers/payroll.controller";

const router = Router();

/**
 * Payroll Routes
 * Base path: /api/payroll
 *
 * All-employee salary management: Admin / HR / Accounts Manager only.
 * Other authenticated users may only list/view their own payslips.
 */

// All routes require authentication
router.use(authenticate);

// Calculate payroll preview (without saving)
router.post("/calculate", requireSalaryAccess, handleCalculatePayroll);

// Generate payroll for specific employee
router.post("/generate", requireSalaryAccess, handleGeneratePayroll);

// Bulk generate payroll for all employees
router.post("/bulk-generate", requireSalaryAccess, handleBulkGeneratePayroll);

// Get payroll statistics
router.get("/statistics", requireSalaryAccess, handleGetPayrollStatistics);

// Get payrolls with filters — own slips for non-salary roles; all for salary roles
router.get("/", handleGetPayrolls);

// Get specific payroll by ID (payslip)
router.get("/:id", handleGetPayrollById);

// Edit full-time salary sheet row (days worked, advance, other)
router.patch("/:id/salary-sheet", requireSalaryAccess, handleUpdateSalarySheet);

// Process payroll (mark as processed)
router.post("/:id/process", requireSalaryAccess, handleProcessPayroll);

// Mark payroll as paid
router.post("/:id/mark-paid", requireSalaryAccess, handleMarkPayrollAsPaid);

export default router;
