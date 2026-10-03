import mongoose from "mongoose";
import User, { UserRole, EmployeeType } from "../models/User";
import LeaveBalance from "../models/LeaveBalance";
import Notification from "../models/Notification";
import TaskTimer from "../models/TaskTimer";
import TaskComment from "../models/TaskComment";
import Task from "../models/Task";
import Project from "../models/Project";
import ProjectMember from "../models/ProjectMember";
import Payroll from "../models/Payroll";
import Leave from "../models/Leave";
import Attendance from "../models/Attendance";
import Subtask from "../models/Subtask";
import CustomRole from "../models/CustomRole";
import Department from "../models/Department";
import Office from "../models/Office";
import { EMPLOYEE_DOCUMENT_PREFIX, getEmployeeDocumentUrl as getSignedDocumentUrl } from "../config/r2";

/**
 * Employee Service
 * Handles all employee-related business logic
 */

interface EmployeeFilters {
  search?: string;
  department?: string;
  role?: UserRole;
  employeeType?: string;
  isActive?: boolean;
  managerId?: string;
}

interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

interface CreateEmployeeData {
  email: string;
  password: string;
  fullName: string;
  username?: string; // Added from schema
  role: UserRole;
  roleName?: string | null;
  employeeType?: EmployeeType | string;
  designation?: string | null;
  department?: string | null;
  phone?: string | null;
  phoneNumber?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  dateOfBirth?: Date | null;
  joinDate?: Date | null;
  panCardKey?: string | null;
  aadhaarCardKey?: string | null;
  managerId?: string | null;
  officeId?: string | null;
  hourlyRate?: number | null;
  salary?: number | null; // Added from schema
  monthlySalary?: number | null;
  overtimeMultiplier?: number | null;
  allowWorkFromHome?: boolean | null; // Added from schema
  isActive?: boolean;
}

export interface UpdateEmployeeData {
  roleName?: string | null;
  fullName?: string;
  email?: string;
  username?: string; // Added from schema
  employeeType?: EmployeeType | string;
  designation?: string | null;
  department?: string | null;
  phone?: string | null;
  phoneNumber?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  dateOfBirth?: Date | string | null;
  joinDate?: Date | string | null;
  managerId?: string | null;
  officeId?: string | null;
  hourlyRate?: number | null;
  salary?: number | null; // Added from schema
  monthlySalary?: number | null;
  overtimeMultiplier?: number | null;
  allowWorkFromHome?: boolean | null; // Added from schema
  isActive?: boolean;
  role?: UserRole;
  password?: string;
}

/**
 * Get all employees with filters and pagination
 */
// Get all employees with filters and pagination
export const getAllEmployees = async (
  filters: EmployeeFilters,
  pagination: PaginationOptions,
  requestingUserId: string,
  requestingUserUserRole: UserRole
) => {
  const {
    search,
    department,
    role,
    employeeType,
    isActive,
    managerId,
  } = filters;

  const {
    page = 1,
    limit = 20,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = pagination;

  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {};

  // UserRole-based filtering
  if (requestingUserUserRole === "EMPLOYEE") {
    // Employees can only see themselves if they access this list
    where._id = requestingUserId;
  }

  // Search filter (name or email)
  if (search) {
    where.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { designation: { $regex: search, $options: "i" } },
    ];
  }

  // Department filter
  if (department) {
    where.department = department;
  }

  // UserRole filter
  if (role) {
    where.role = role;
  }

  // EmployeeType filter
  if (employeeType && employeeType !== "all") {
    where.employeeType = employeeType;
  }

  // Active status filter
  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  // Manager filter (Admin only)
  if (managerId && requestingUserUserRole === "ADMIN") {
    where.managerId = managerId;
  }

  // Fetch employees with pagination
  const [employees, total, managersCount, activeCount] = await Promise.all([
    User.find(where)
      .select("id email fullName role roleName employeeType designation department phone joinDate monthlySalary hourlyRate overtimeMultiplier isActive managerId officeId createdAt")
      .populate("manager", "id fullName email")
      .populate("office", "id name")
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(where),
    User.countDocuments({ ...where, role: "MANAGER" }),
    User.countDocuments({ ...where, isActive: true }),
  ]);

  const stats = {
    total,
    managers: managersCount,
    active: activeCount,
  };

  return {
    employees,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    stats,
  };
};

/**
 * Get employee by ID
 */
// Get employee by ID
export const getEmployeeById = async (
  id: string,
  requestingUserId: string,
  requestingUserUserRole: UserRole
) => {
  const employee = await User.findById(id)
    .select("id email fullName role roleName employeeType designation department phone address emergencyContact dateOfBirth joinDate monthlySalary hourlyRate overtimeMultiplier isActive managerId officeId panCardKey aadhaarCardKey createdAt updatedAt")
    .populate("manager", "id fullName email designation")
    .populate("office", "id name address latitude longitude radiusMeters");

  if (!employee) {
    throw new Error("Employee not found");
  }

  // UserRole-based access control
  if (requestingUserUserRole === "MANAGER") {
    // Managers can only view their team members or themselves
    if (employee.managerId?.toString() !== requestingUserId && employee.id !== requestingUserId) {
      throw new Error("Access denied: You can only view your team members");
    }
  } else if (requestingUserUserRole === "EMPLOYEE") {
    // Employees can only view themselves
    if (employee.id !== requestingUserId) {
      throw new Error("Access denied: You can only view your own profile");
    }
  }

  return employee;
};

/**
 * Create new employee
 */
// Create new employee
export const createEmployee = async (
  data: CreateEmployeeData,
  requestingUserId: string,
  requestingUserUserRole: UserRole
) => {

  // Check if email already exists
  const existingUser = await User.findOne({ email: data.email });

  if (existingUser) {
    throw new Error("Email already exists");
  }

  // Custom roles grant the access level of their base role
  let roleName: string | undefined;
  if (data.roleName && data.roleName.trim() !== "") {
    const customRole = await CustomRole.findOne({ name: data.roleName.trim() }).collation({ locale: "en", strength: 2 });
    if (!customRole) {
      throw new Error("Selected role not found");
    }
    data.role = customRole.baseRole;
    roleName = customRole.name;
  }

  for (const key of [data.panCardKey, data.aadhaarCardKey]) {
    if (key && !key.startsWith(EMPLOYEE_DOCUMENT_PREFIX)) {
      throw new Error("Invalid document reference");
    }
  }

  // Validate manager assignment
  if (requestingUserUserRole === "MANAGER") {
    // Managers can only assign themselves as manager
    data.managerId = requestingUserId;
    // Managers cannot create ADMIN users
    if (data.role === "ADMIN") {
      throw new Error("Access denied: Managers cannot create Admin users");
    }
  }

  // Validate manager exists if provided
  if (data.managerId) {
    const manager = await User.findById(data.managerId);

    if (!manager) {
      throw new Error("Manager not found");
    }

    if (manager.role !== "MANAGER" && manager.role !== "ADMIN") {
      throw new Error("Assigned manager must have MANAGER or ADMIN role");
    }
  }

  const officeId = await resolveOfficeId(data.officeId);

  const newId = new mongoose.Types.ObjectId();

  // Create employee (password will be hashed automatically by model middleware)
  const employee = await User.create({
    _id: newId,
    email: data.email,
    password: data.password,
    fullName: data.fullName,
    role: data.role,
    roleName,
    employeeType: (data.employeeType as any) || EmployeeType.FULL_TIME,
    employeeId: newId.toString(),
    designation: data.designation || undefined,
    department: data.department || undefined,
    phone: data.phone || data.phoneNumber || undefined,
    address: data.address || undefined,
    emergencyContact: data.emergencyContact || undefined,
    dateOfBirth: data.dateOfBirth || undefined,
    joinDate: data.joinDate || new Date(),
    managerId: data.managerId || undefined,
    officeId,
    monthlySalary: data.monthlySalary || undefined,
    hourlyRate: data.monthlySalary ? (data.monthlySalary / 270) : (data.hourlyRate || 0),
    overtimeMultiplier: data.overtimeMultiplier || undefined,
    panCardKey: data.panCardKey || undefined,
    aadhaarCardKey: data.aadhaarCardKey || undefined,
    isActive: data.isActive !== undefined ? data.isActive : true,
  });

  // Create initial leave balance
  await LeaveBalance.create({
    userId: employee._id,
    casualLeave: 12,
    sickLeave: 12,
    paidLeave: 18,
    year: new Date().getFullYear(),
  });

  return employee;
};

/**
 * Update employee
 */
// Update employee
export const updateEmployee = async (
  id: string,
  data: UpdateEmployeeData,
  requestingUserId: string,
  requestingUserUserRole: UserRole
) => {
  // Check if employee exists
  const existingEmployee = await User.findById(id);

  if (!existingEmployee) {
    throw new Error("Employee not found");
  }

  // UserRole-based access control
  if (requestingUserUserRole === "MANAGER") {
    // Managers can only update their team members
    if (existingEmployee.managerId?.toString() !== requestingUserId && existingEmployee.id !== requestingUserId) {
      throw new Error("Access denied: You can only update your team members");
    }
    // Managers cannot change role or manager assignment
    delete data.role;
    delete data.roleName;
    delete data.managerId;

    // Security Guard: Prevent Managers from updating their own salary/rates
    if (id === requestingUserId) {
        delete data.hourlyRate;
        delete data.monthlySalary;
        delete data.overtimeMultiplier;
        delete data.salary; // Just in case it appears in future schemas
    }
  }

  // Check email uniqueness if changing email
  if (data.email && data.email.toLowerCase() !== existingEmployee.email.toLowerCase()) {
    const emailExists = await User.findOne({ email: data.email.toLowerCase(), _id: { $ne: id } });
    if (emailExists) {
      throw new Error("Email is already in use by another employee");
    }
    existingEmployee.email = data.email.toLowerCase();
  }

  // Validate manager if changing
  if (data.managerId === "none" || data.managerId === "" || data.managerId === null) {
    existingEmployee.managerId = null;
  } else if (data.managerId && typeof data.managerId === "string" && data.managerId.length > 0) {
    const manager = await User.findById(data.managerId);
    if (!manager) {
      throw new Error("Manager not found");
    }
    if (manager.role !== "MANAGER" && manager.role !== "ADMIN") {
      throw new Error("Assigned manager must have MANAGER or ADMIN role");
    }
    existingEmployee.managerId = manager._id as any;
  }

  if (data.officeId !== undefined) {
    const currentOfficeId = existingEmployee.officeId ? String(existingEmployee.officeId) : null;
    const requestedOfficeId = data.officeId && data.officeId !== "none" ? data.officeId : null;
    if (requestedOfficeId !== currentOfficeId) {
      existingEmployee.officeId = (await resolveOfficeId(data.officeId)) as any;
    }
  }

  if (data.password !== undefined && data.password !== "") {
    if (requestingUserUserRole !== "ADMIN") {
      throw new Error("Access denied: Only Admins can change an employee's password");
    }
    existingEmployee.password = data.password;
  }

  // Phone number mapping and clearing
  if (data.phoneNumber !== undefined || data.phone !== undefined) {
    const p = data.phone || data.phoneNumber;
    existingEmployee.phone = p && p.trim() !== "" ? p.trim() : null;
  }

  // Update salary
  if (data.monthlySalary !== undefined) {
    if (data.monthlySalary != null && data.monthlySalary > 0) {
      existingEmployee.monthlySalary = data.monthlySalary;
      existingEmployee.hourlyRate = Math.round((data.monthlySalary / 270) * 100) / 100;
    } else {
      existingEmployee.monthlySalary = null;
      existingEmployee.hourlyRate = null;
    }
  }

  // Department and Designation
  if (data.department !== undefined) {
    existingEmployee.department = data.department && data.department !== "none" && data.department.trim() !== "" ? data.department.trim() : null;
  }
  if (data.designation !== undefined) {
    existingEmployee.designation = data.designation && data.designation.trim() !== "" ? data.designation.trim() : null;
  }
  if (data.fullName !== undefined && data.fullName.trim() !== "") {
    existingEmployee.fullName = data.fullName.trim();
  }
  if (data.roleName !== undefined && data.roleName !== null && data.roleName.trim() !== "") {
    const customRole = await CustomRole.findOne({ name: data.roleName.trim() }).collation({ locale: "en", strength: 2 });
    if (!customRole) {
      throw new Error("Selected role not found");
    }
    existingEmployee.role = customRole.baseRole;
    existingEmployee.roleName = customRole.name;
  } else if (data.roleName !== undefined) {
    if (data.role !== undefined) existingEmployee.role = data.role;
    existingEmployee.roleName = null;
  } else if (data.role !== undefined && data.role !== existingEmployee.role) {
    existingEmployee.role = data.role;
    existingEmployee.roleName = null;
  }
  if (data.isActive !== undefined) {
    existingEmployee.isActive = Boolean(data.isActive);
  }
  if (data.employeeType !== undefined) {
    existingEmployee.employeeType = data.employeeType as any;
  }
  if (data.address !== undefined) {
    existingEmployee.address = data.address && data.address.trim() !== "" ? data.address.trim() : null;
  }
  if (data.emergencyContact !== undefined) {
    existingEmployee.emergencyContact = data.emergencyContact && data.emergencyContact.trim() !== "" ? data.emergencyContact.trim() : null;
  }
  if (data.overtimeMultiplier !== undefined) {
    existingEmployee.overtimeMultiplier = data.overtimeMultiplier || 1.5;
  }

  await existingEmployee.save();

  return await User.findById(id)
    .select("id email fullName role roleName employeeType designation department phone address emergencyContact dateOfBirth joinDate monthlySalary hourlyRate overtimeMultiplier isActive managerId officeId updatedAt")
    .populate("manager", "id fullName email")
    .populate("office", "id name");
};

async function resolveOfficeId(officeId?: string | null) {
  if (!officeId || officeId === "none") return null;
  if (!mongoose.Types.ObjectId.isValid(officeId)) {
    throw new Error("Invalid office");
  }
  const office = await Office.findById(officeId).select("_id isActive");
  if (!office) throw new Error("Selected office not found");
  if (!office.isActive) throw new Error("Selected office is inactive");
  return office._id;
}

/**
 * Deactivate employee (soft delete)
 */
// Deactivate employee (soft delete)
export const deactivateEmployee = async (
  id: string,
  requestingUserUserRole: UserRole
) => {
  // Only admins can deactivate employees
  if (requestingUserUserRole !== "ADMIN") {
    throw new Error("Access denied: Only Admins can deactivate employees");
  }

  const employee = await User.findById(id);

  if (!employee) {
    throw new Error("Employee not found");
  }

  // Prevent deactivating yourself
  if (!employee.isActive) {
    throw new Error("Employee is already deactivated");
  }

  const updatedEmployee = await User.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true }
  ).select("id fullName email isActive");

  return updatedEmployee;
};

/**
 * Get employees by manager
 */
// Get employees by manager
export const getEmployeesByManager = async (managerId: string) => {
  const employees = await User.find({
    managerId,
    isActive: true,
  })
    .select("id email fullName role designation department phone joinDate hourlyRate overtimeMultiplier")
    .sort({ fullName: 1 });

  return employees;
};

/**
 * Get all departments (unique)
 */
// Get all departments (unique)
export const getAllDepartments = async () => {
  const [userDepartments, savedDepartments] = await Promise.all([
    User.distinct("department", { department: { $ne: null } }),
    Department.find().select("name"),
  ]);

  const names = [
    ...userDepartments.filter((d): d is string => !!d),
    ...savedDepartments.map((d) => d.name),
  ];

  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
};

const BUILT_IN_ROLE_NAMES = ["admin", "manager", "employee"];

function normalizeOptionName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 50) {
    throw new Error("Name must be between 2 and 50 characters");
  }
  return trimmed;
}

function isDuplicateKeyError(error: any) {
  return error?.code === 11000;
}

// Get all custom roles
const DEFAULT_CUSTOM_ROLES: { name: string; baseRole: UserRole }[] = [
  { name: "HR", baseRole: UserRole.ADMIN },
];

export const ensureDefaultRoles = async () => {
  for (const role of DEFAULT_CUSTOM_ROLES) {
    let existing = await CustomRole.findOne({ name: role.name }).collation({ locale: "en", strength: 2 });
    if (!existing) {
      existing = await CustomRole.create(role);
    } else if (existing.baseRole !== role.baseRole) {
      existing.baseRole = role.baseRole;
      await existing.save();
    }
    await User.updateMany(
      { roleName: existing.name, role: { $ne: role.baseRole } },
      { $set: { role: role.baseRole } }
    );
  }
};

export const getAllCustomRoles = async () => {
  return CustomRole.find().select("id name baseRole").sort({ name: 1 });
};

// Create custom role
export const createCustomRole = async (
  name: string,
  baseRole: UserRole,
  requestingUserId: string,
  requestingUserUserRole: UserRole
) => {
  const roleName = normalizeOptionName(name);

  if (BUILT_IN_ROLE_NAMES.includes(roleName.toLowerCase())) {
    throw new Error("This role already exists");
  }
  if (requestingUserUserRole === "MANAGER" && baseRole === UserRole.ADMIN) {
    throw new Error("Access denied: Managers cannot create roles with Admin access");
  }

  try {
    return await CustomRole.create({ name: roleName, baseRole, createdBy: requestingUserId });
  } catch (error: any) {
    if (isDuplicateKeyError(error)) {
      throw new Error("This role already exists");
    }
    throw error;
  }
};

// Create department
export const createDepartment = async (name: string, requestingUserId: string) => {
  const departmentName = normalizeOptionName(name);

  try {
    return await Department.create({ name: departmentName, createdBy: requestingUserId });
  } catch (error: any) {
    if (isDuplicateKeyError(error)) {
      throw new Error("This department already exists");
    }
    throw error;
  }
};

// Get a short-lived URL for an employee's PAN or Aadhaar image
export const getEmployeeDocumentUrl = async (
  id: string,
  documentType: "pan-card" | "aadhaar-card",
  requestingUserId: string,
  requestingUserUserRole: UserRole
) => {
  const employee = await getEmployeeById(id, requestingUserId, requestingUserUserRole);
  const key = documentType === "pan-card" ? employee.panCardKey : employee.aadhaarCardKey;

  if (!key) {
    throw new Error("Document not uploaded");
  }

  return { url: await getSignedDocumentUrl(key) };
};

// Get all managers
export const getAllManagers = async () => {
  const managers = await User.find({
    $or: [{ role: UserRole.MANAGER }, { role: UserRole.ADMIN }],
    isActive: true,
  })
    .select("id fullName email designation")
    .sort({ fullName: 1 });

  return managers;
};

/**
 * Toggle employee status
 */
export const toggleEmployeeStatus = async (
  id: string,
  requestingUserUserRole: UserRole,
  requestingUserId: string
) => {
  if (requestingUserUserRole !== "ADMIN" && requestingUserUserRole !== "MANAGER") {
    throw new Error("Access denied: Only Admins/Managers can toggle employee status");
  }

  const employee = await User.findById(id);
  if (!employee) {
    throw new Error("Employee not found");
  }

  // Managers can only toggle their own team members
  if (
    requestingUserUserRole === "MANAGER" &&
    employee.managerId?.toString() !== requestingUserId
  ) {
    throw new Error("Access denied: You can only toggle status for your team members");
  }

  const updatedEmployee = await User.findByIdAndUpdate(
    id,
    { isActive: !employee.isActive },
    { new: true }
  ).select("id fullName isActive");

  return updatedEmployee;
};

/**
 * Permanently delete employee
 */
export const deleteEmployee = async (
  id: string,
  requestingUserUserRole: UserRole
) => {
  if (requestingUserUserRole !== "ADMIN") {
    throw new Error("Access denied: Only Admins can permanently delete employees");
  }

  const employee = await User.findById(id);
  if (!employee) {
    throw new Error("Employee not found");
  }

  // Mongoose transaction if replica set unavailable might fail, so using sequential deletes
  // This mimics the controller transaction logic

  // Update employees who report to this manager
  await User.updateMany({ managerId: id }, { managerId: null });

  // Subtasks are kept (not deleted) to preserve company task progress logs
  await Subtask.updateMany({ createdBy: id }, { $unset: { createdBy: "" } });

  // Delete related records
  await Notification.deleteMany({ userId: id });
  await TaskTimer.deleteMany({ userId: id });
  // Comments are kept so company task context isn't lost
  await TaskComment.updateMany({ userId: id }, { $unset: { userId: "" } });

  // Remove from Project members (separate collection)
  await ProjectMember.deleteMany({ userId: id });

  // Inconsistent: If Project model ALSO has a members array, clear it too
  try {
    await Project.updateMany(
      { "members.userId": id },
      { $pull: { members: { userId: id } } as any }
    );
  } catch (e) { }

  // Payroll records are KEPT (not deleted) for financial audit and tax compliance.
  // We only delete transient operational data.
  await Payroll.updateMany({ userId: id }, { $set: { userId: null, note: "Employee Record Deleted" } });
  
  await LeaveBalance.deleteMany({ userId: id });
  await Leave.deleteMany({ userId: id });
  await Attendance.deleteMany({ userId: id });

  // Correct deletion cascade for tasks
  // 1. Remove this user from all tasks they are assigned to
  await Task.updateMany(
    { assignedTo: id },
    { $pull: { assignedTo: id } }
  );

  // 2. Clear assignedBy if they created the task (so it doesn't break refs)
  await Task.updateMany(
    { assignedBy: id },
    { $set: { assignedBy: null } }
  );



  await User.findByIdAndDelete(id);

  return true;
};
