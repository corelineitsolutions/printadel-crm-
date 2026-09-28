import { Router } from "express";
import { projectController } from "../controllers/project.controller";
import { authenticate } from "../middleware/auth.middleware";
import { requireRoles } from "../middleware/role.middleware";
import { UserRole } from "../models/User";

const router = Router();

/**
 * Project Routes
 * All routes require authentication
 */

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @route   GET /api/projects/stats
 * @desc    Get project statistics
 * @access  Private (All authenticated users)
 */
router.get("/stats", projectController.getStats);

/**
 * @route   POST /api/projects
 * @desc    Create a new project
 * @access  Private (Admin, Manager)
 */
router.post("/", requireRoles(UserRole.ADMIN, UserRole.MANAGER), projectController.createProject);

/**
 * @route   GET /api/projects
 * @desc    Get all projects (role-filtered)
 * @access  Private (All authenticated users)
 */
router.get("/", projectController.getProjects);

/**
 * @route   GET /api/projects/:id
 * @desc    Get project by ID
 * @access  Private (All authenticated users)
 */
router.get("/:id", projectController.getProjectById);

/**
 * @route   PUT /api/projects/:id
 * @desc    Update project
 * @access  Private (Admin, Manager, Creator)
 */
router.put("/:id", projectController.updateProject);

/**
 * @route   DELETE /api/projects/:id
 * @desc    Delete project
 * @access  Private (Admin, Creator)
 */
router.delete("/:id", projectController.deleteProject);

/**
 * @route   POST /api/projects/:id/members
 * @desc    Add members to project
 * @access  Private (Admin, Manager, Creator)
 */
router.post("/:id/members", projectController.addMembers);

/**
 * @route   DELETE /api/projects/:id/members/:memberId
 * @desc    Remove member from project
 * @access  Private (Admin, Manager, Creator)
 */
router.delete("/:id/members/:memberId", projectController.removeMember);

export default router;
