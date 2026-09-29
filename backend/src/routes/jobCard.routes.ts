import { Router } from "express";
import {
  createJobCard,
  getJobCards,
  getJobCardById,
  updateJobCard,
  updateJobCardStatus,
  deleteJobCard,
  getJobCardStats,
} from "../controllers/jobCard.controller";
import { authenticate } from "../middleware/auth.middleware";
import { requireManagerOrAdmin } from "../middleware/role.middleware";

const router = Router();

// All routes require authentication
router.use(authenticate);

// List job cards & statistics
router.get("/", getJobCards);
router.get("/stats", getJobCardStats);
router.get("/:id", getJobCardById);

// Create job card (Admin & Manager)
router.post("/", requireManagerOrAdmin, createJobCard);

// Update status (Accessible to assignees, managers, and admin)
router.patch("/:id/status", updateJobCardStatus);

// Update job card details
router.put("/:id", requireManagerOrAdmin, updateJobCard);

// Delete job card (Admin only)
router.delete("/:id", requireManagerOrAdmin, deleteJobCard);

export default router;
