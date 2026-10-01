import { Request, Response } from "express";
import { z } from "zod";
import { successResponse, errorResponse } from "../utils/response.utils";
import * as employeeService from "../services/employee.service";
import { uploadEmployeeDocument as uploadDocumentToR2 } from "../config/r2";

/**
 * Employee Controller
 * Handles employee management operations
 */

// Validation schemas
const createEmployeeSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  phoneNumber: z.string().optional(),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]),
  roleName: z.string().nullable().optional(),
  employeeType: z.enum(["Full-time", "Part-time", "Contract"]).optional(),
  designation: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  officeId: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  salary: z.number().nullable().optional(),
  monthlySalary: z.number().nullable().optional(),
  hourlyRate: z.number().nullable().optional(),
  overtimeMultiplier: z.number().nullable().optional(),
  allowWorkFromHome: z.boolean().nullable().optional(),
  panCardKey: z.string().nullable().optional(),
  aadhaarCardKey: z.string().nullable().optional(),
});

const createCustomRoleSchema = z.object({
  name: z.string().min(2).max(50),
  baseRole: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]).default("EMPLOYEE"),
});

const createDepartmentSchema = z.object({
  name: z.string().min(2).max(50),
});

const documentTypeSchema = z.enum(["pan-card", "aadhaar-card"]);

const uploadDocumentSchema = z.object({
  documentType: documentTypeSchema,
  image: z.string().min(1),
});

const updateEmployeeSchema = z.object({
  username: z.string().min(3).optional(),
  email: z.string().email().optional(),
  fullName: z.string().min(2).optional(),
  phoneNumber: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]).optional(),
  employeeType: z.enum(["Full-time", "Part-time", "Contract"]).optional(),
  designation: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  officeId: z.string().nullable().optional(),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  salary: z.number().nullable().optional(),
  monthlySalary: z.number().nullable().optional(),
  hourlyRate: z.number().nullable().optional(),
  overtimeMultiplier: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
  address: z.string().nullable().optional(),
  emergencyContact: z.string().nullable().optional(),
  dateOfBirth: z.string().or(z.date()).nullable().optional(),
  joinDate: z.string().or(z.date()).nullable().optional(),
});

/**
 * POST /api/employees
 * Create new employee
 */
export async function createEmployee(req: Request, res: Response) {
  try {
    const data = createEmployeeSchema.parse(req.body);
    const requestingUserId = req.user!.id;
    const requestingUserRole = req.user!.role;

    const user = await employeeService.createEmployee(
      { ...data, role: data.role as any },
      requestingUserId,
      requestingUserRole
    );

    return successResponse(res, user, "Employee created successfully", 201);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/employees
 * Get all employees with filters
 */
export async function getAllEmployees(req: Request, res: Response) {
  try {

    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const employeeType = typeof req.query.employeeType === 'string' ? req.query.employeeType : undefined;
    const department = typeof req.query.department === 'string' ? req.query.department : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const page = typeof req.query.page === 'string' ? req.query.page : "1";
    const limit = typeof req.query.limit === 'string' ? req.query.limit : "10";
    const isActive = typeof req.query.isActive === 'string' ? req.query.isActive : undefined;
    const managerId = typeof req.query.managerId === 'string' ? req.query.managerId : undefined;

    const requestingUserId = req.user!.id;
    const requestingUserRole = req.user!.role;

    // Use specific keys for filters instead of building a partial Mongoose query in controller
    const filters = {
      role: (role && role !== "all") ? (role as any) : undefined,
      employeeType: (employeeType && employeeType !== "all") ? employeeType : undefined,
      department: (department && department !== "all") ? department : undefined,
      search,
      isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
      managerId
    };

    const pagination = {
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    };

    const result = await employeeService.getAllEmployees(
      filters,
      pagination,
      requestingUserId,
      requestingUserRole
    );

    return successResponse(
      res,
      result,
      "Employees retrieved successfully"
    );
  } catch (error: any) {
    console.error("Error in getAllEmployees:", error); // Added logging
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/employees/:id
 * Get employee by ID
 */
export async function getEmployeeById(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const requestingUserId = req.user!.id;
    const requestingUserRole = req.user!.role;

    const employee = await employeeService.getEmployeeById(id, requestingUserId, requestingUserRole);

    return successResponse(res, employee, "Employee retrieved successfully");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * PUT /api/employees/:id
 * Update employee
 */
export async function updateEmployee(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const data = updateEmployeeSchema.parse(req.body);
    const requestingUserId = req.user!.id;
    const requestingUserRole = req.user!.role;

    const updated = await employeeService.updateEmployee(
      id,
      { ...data, role: data.role as any },
      requestingUserId,
      requestingUserRole
    );

    return successResponse(res, updated, "Employee updated successfully");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * PATCH /api/employees/:id/toggle-status
 * Toggle employee active/inactive status
 */
export async function toggleEmployeeStatus(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const requestingUserRole = req.user!.role;
    const requestingUserId = req.user!.id; // Added for correct permission check

    const updated = await employeeService.toggleEmployeeStatus(id, requestingUserRole, requestingUserId);

    return successResponse(
      res,
      updated,
      `Employee ${updated?.isActive ? "activated" : "deactivated"} successfully`
    );
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * DELETE /api/employees/:id
 * Permanently delete employee from database
 */
export async function deleteEmployee(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const requestingUserRole = req.user!.role;

    await employeeService.deleteEmployee(id, requestingUserRole);

    return successResponse(res, null, "Employee permanently deleted from system");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/employees/managers
 * Get all managers
 */
export async function getAllManagers(_req: Request, res: Response) {
  try {
    const managers = await employeeService.getAllManagers();
    return successResponse(res, managers, "Managers retrieved successfully");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/employees/departments
 * Get all departments
 */
export async function getAllDepartments(_req: Request, res: Response) {
  try {
    const departments = await employeeService.getAllDepartments();
    return successResponse(res, departments, "Departments retrieved successfully");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * POST /api/employees/departments
 * Add a department option
 */
export async function createDepartment(req: Request, res: Response) {
  try {
    const { name } = createDepartmentSchema.parse(req.body);
    const department = await employeeService.createDepartment(name, req.user!.id);
    return successResponse(res, department, "Department added successfully", 201);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/employees/roles
 * Get custom roles
 */
export async function getAllCustomRoles(_req: Request, res: Response) {
  try {
    const roles = await employeeService.getAllCustomRoles();
    return successResponse(res, roles, "Roles retrieved successfully");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * POST /api/employees/roles
 * Add a custom role
 */
export async function createCustomRole(req: Request, res: Response) {
  try {
    const { name, baseRole } = createCustomRoleSchema.parse(req.body);
    const role = await employeeService.createCustomRole(
      name,
      baseRole as any,
      req.user!.id,
      req.user!.role
    );
    return successResponse(res, role, "Role added successfully", 201);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * POST /api/employees/documents
 * Upload a PAN / Aadhaar image to R2
 */
export async function uploadEmployeeDocument(req: Request, res: Response) {
  try {
    const { documentType, image } = uploadDocumentSchema.parse(req.body);
    const key = await uploadDocumentToR2(documentType, image);
    return successResponse(res, { key }, "Document uploaded successfully", 201);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

/**
 * GET /api/employees/:id/documents/:documentType
 * Get a short-lived URL to view a PAN / Aadhaar image
 */
export async function getEmployeeDocumentUrl(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const documentType = documentTypeSchema.parse(req.params.documentType);
    const result = await employeeService.getEmployeeDocumentUrl(
      id,
      documentType,
      req.user!.id,
      req.user!.role
    );
    return successResponse(res, result, "Document URL generated");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}
