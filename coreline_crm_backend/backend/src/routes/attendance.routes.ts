import { Router } from "express";
import {
  handlePunchIn,
  handlePunchOut,
  handleStartBreak,
  handleEndBreak,
  handleGetMyAttendance,
  handleGetTeamAttendance,
  handleGetTodayAttendance,
  handleCorrectionRequest,
  handleGetCorrections,
  handleApproveCorrection,
  handleAssignWFH,
  handleGetWFH,
  handleDeactivateWFH,
  handleUpdateStatus,
  handleToggleOvertime,
  handleGetOvertime,
} from "../controllers/attendance.controller";
import { authenticate } from "../middleware/auth.middleware";
import { requireManagerOrAdmin } from "../middleware/role.middleware";

/**
 * Attendance Routes
 * /api/attendance/*
 */

const router = Router();

// All routes require authentication
router.use(authenticate);

// Punch in/out
router.post("/punch-in", handlePunchIn);
router.post("/punch-out", handlePunchOut);
router.patch("/toggle-overtime", handleToggleOvertime);

// Break management
router.post("/start-break", handleStartBreak);
router.post("/end-break", handleEndBreak);

// Get attendance & overtime records
router.get("/my-attendance", handleGetMyAttendance);
router.get("/today", handleGetTodayAttendance);
router.get("/overtime", handleGetOvertime);

// Team attendance (Manager/Admin only)
router.get("/team-attendance", requireManagerOrAdmin, handleGetTeamAttendance);

// Attendance corrections
router.post("/correction-request", handleCorrectionRequest);
router.get("/corrections", requireManagerOrAdmin, handleGetCorrections);
router.put("/corrections/:id", requireManagerOrAdmin, handleApproveCorrection);

// WFH management
router.post("/wfh", requireManagerOrAdmin, handleAssignWFH);
router.get("/wfh", requireManagerOrAdmin, handleGetWFH);
router.delete("/wfh/:id", requireManagerOrAdmin, handleDeactivateWFH);

// Manual status update
router.patch("/:id/status", requireManagerOrAdmin, handleUpdateStatus);

export default router;
