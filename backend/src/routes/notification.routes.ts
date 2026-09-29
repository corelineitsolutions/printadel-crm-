import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import {
  handleGetNotifications,
  handleGetUnreadCount,
  handleMarkAsRead,
  handleMarkAllAsRead,
  handleDeleteNotification,
} from "../controllers/notification.controller";

const router = Router();

/**
 * Notification Routes
 * Base path: /api/notifications
 */

router.use(authenticate);

router.get("/", handleGetNotifications);
router.get("/unread-count", handleGetUnreadCount);
router.post("/mark-all-read", handleMarkAllAsRead);
router.post("/:id/mark-read", handleMarkAsRead);
router.delete("/:id", handleDeleteNotification);

export default router;
