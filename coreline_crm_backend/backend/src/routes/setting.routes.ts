import { Router } from "express";
import { settingController } from "../controllers/setting.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";

const router = Router();

/**
 * Setting Routes
 * All routes require authentication
 */

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @route   GET /api/settings
 * @desc    Get all settings
 * @access  Private (All authenticated users, though mainly for admin/system use)
 */
router.get("/", settingController.getSettings);

/**
 * @route   PUT /api/settings
 * @desc    Update settings
 * @access  Private (Admin only)
 */
router.put("/", authorize("ADMIN"), settingController.updateSettings);

export default router;
