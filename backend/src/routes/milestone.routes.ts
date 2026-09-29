import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { requireRoles } from "../middleware/role.middleware";
import { UserRole } from "../models/User";
import {
  createMilestone,
  getMilestones,
  getMilestoneById,
  updateMilestone,
  deleteMilestone,
  updateMilestoneStatus,
} from "../controllers/milestone.controller";

const router = Router();

/**
 * Milestone Routes
 * Base path: /api/milestones
 */

// All routes require authentication
router.use(authenticate);

// Get all milestones (with optional project filter)
router.get("/", getMilestones);

// Get milestone by ID
router.get("/:id", getMilestoneById);

// Create milestone (ADMIN, MANAGER only)
router.post("/", requireRoles(UserRole.ADMIN, UserRole.MANAGER), createMilestone);

// Update milestone (ADMIN, MANAGER only)
router.put("/:id", requireRoles(UserRole.ADMIN, UserRole.MANAGER), updateMilestone);

// Update milestone status (ADMIN, MANAGER only)
router.patch("/:id/status", requireRoles(UserRole.ADMIN, UserRole.MANAGER), updateMilestoneStatus);

// Delete milestone (ADMIN, MANAGER only)
router.delete("/:id", requireRoles(UserRole.ADMIN, UserRole.MANAGER), deleteMilestone);

export default router;
