import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { requireRoles } from "../middleware/role.middleware";
import { UserRole } from "../models/User";
import {
  createEmployee,
  getAllEmployees,
  getEmployeeById,
  updateEmployee,
  toggleEmployeeStatus,
  deleteEmployee,
  getAllManagers,
  getAllDepartments,
} from "../controllers/employee.controller";

const router = Router();

/**
 * Employee Routes
 * Base path: /api/employees
 */

// All routes require authentication
router.use(authenticate);

// Get all managers
router.get("/managers", getAllManagers);

// Get all departments
router.get("/departments", getAllDepartments);

// Get all employees
router.get("/", getAllEmployees);

// Get employee by ID
router.get("/:id", getEmployeeById);

// Create employee (ADMIN, MANAGER only)
router.post("/", requireRoles(UserRole.ADMIN, UserRole.MANAGER), createEmployee);

// Update employee (ADMIN, MANAGER only)
router.put("/:id", requireRoles(UserRole.ADMIN, UserRole.MANAGER), updateEmployee);

// Toggle employee active/inactive status (ADMIN, MANAGER only)
router.patch("/:id/toggle-status", requireRoles(UserRole.ADMIN, UserRole.MANAGER), toggleEmployeeStatus);

// Permanently delete employee (ADMIN only)
router.delete("/:id", requireRoles(UserRole.ADMIN), deleteEmployee);

export default router;
