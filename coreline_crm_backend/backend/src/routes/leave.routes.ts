import { Router } from "express";
import { leaveController } from "../controllers/leave.controller";
import { authenticate } from "../middleware/auth.middleware";
import { requireRoles } from "../middleware/role.middleware";
import { UserRole } from "../models/User";

const router = Router();

/**
 * Leave Routes
 * All routes require authentication
 */

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @route   POST /api/leaves
 * @desc    Apply for leave
 * @access  Private (All authenticated users)
 */
router.post("/", leaveController.applyLeave);

/**
 * @route   GET /api/leaves
 * @desc    Get all leaves (filtered by role)
 * @access  Private (All authenticated users)
 */
router.get("/", leaveController.getLeaves);

/**
 * @route   GET /api/leaves/balance
 * @desc    Get my leave balance
 * @access  Private (All authenticated users)
 */
router.get("/balance", leaveController.getMyLeaveBalance);

/**
 * @route   GET /api/leaves/stats
 * @desc    Get leave statistics
 * @access  Private (All authenticated users)
 */
router.get("/stats", leaveController.getLeaveStats);

/**
 * @route   GET /api/leaves/balance/:userId
 * @desc    Get user leave balance
 * @access  Private (Admin, Manager)
 */
router.get(
  "/balance/:userId",
  requireRoles(UserRole.ADMIN, UserRole.MANAGER),
  leaveController.getUserLeaveBalance
);

/**
 * @route   GET /api/leaves/:id
 * @desc    Get leave by ID
 * @access  Private (All authenticated users)
 */
router.get("/:id", leaveController.getLeaveById);

/**
 * @route   PATCH /api/leaves/:id/status
 * @desc    Update leave status (Approve/Reject)
 * @access  Private (Admin, Manager)
 */
router.patch(
  "/:id/status",
  requireRoles(UserRole.ADMIN, UserRole.MANAGER),
  leaveController.updateLeaveStatus
);

/**
 * @route   DELETE /api/leaves/:id
 * @desc    Cancel leave
 * @access  Private (Owner)
 */
router.delete("/:id", leaveController.cancelLeave);

export default router;
