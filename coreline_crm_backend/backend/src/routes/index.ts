import { Router } from "express";
import authRoutes from "./auth.routes";
import attendanceRoutes from "./attendance.routes";
import employeeRoutes from "./employee.routes";
import leaveRoutes from "./leave.routes";
import projectRoutes from "./project.routes";
import milestoneRoutes from "./milestone.routes";
import taskRoutes from "./task.routes";
import payrollRoutes from "./payroll.routes";
import reportsRoutes from "./reports.routes";
import notificationRoutes from "./notification.routes";
import settingRoutes from "./setting.routes";
import jobCardRoutes from "./jobCard.routes";
import productivityRoutes from "./productivity.routes";

/**
 * Main Routes Index
 * Combines all route modules
 */

const router = Router();

// Mount route modules
router.use("/auth", authRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/employees", employeeRoutes);
router.use("/leaves", leaveRoutes);
router.use("/projects", projectRoutes);
router.use("/milestones", milestoneRoutes);
router.use("/tasks", taskRoutes);
router.use("/payroll", payrollRoutes);
router.use("/reports", reportsRoutes);
router.use("/notifications", notificationRoutes);
router.use("/settings", settingRoutes);
router.use("/job-cards", jobCardRoutes);
router.use("/productivity", productivityRoutes);

// Health check endpoint
router.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "API is running",
    timestamp: new Date().toISOString(),
  });
});

export default router;
