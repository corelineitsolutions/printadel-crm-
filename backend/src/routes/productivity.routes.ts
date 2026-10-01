import { Router } from "express";
import {
  logActivity,
  logActivitiesBatch,
  getMyProductivityLogs,
  getAllProductivityLogs,
  getProductivityStats,
  getActivityTypes,
} from "../controllers/productivity.controller";
import { authenticate } from "../middleware/auth.middleware";
import { requireManagerOrAdmin } from "../middleware/role.middleware";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get available activity types
router.get("/activity-types", getActivityTypes);

// Log activity (Logout modal or manual log)
router.post("/log", logActivity);
router.post("/log-batch", logActivitiesBatch);

// Get my personal logs (Employee & Admin)
router.get("/my-logs", getMyProductivityLogs);

// Get productivity stats (Filtered for Employee or Company-wide for Admin/Manager)
router.get("/stats", getProductivityStats);

// Get all productivity logs (Admin & Manager only)
router.get("/all", requireManagerOrAdmin, getAllProductivityLogs);

export default router;
