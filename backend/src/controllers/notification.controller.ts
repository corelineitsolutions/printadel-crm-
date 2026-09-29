import { Request, Response } from "express";
import {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  deleteNotification,
} from "../services/notification.service";
import { successResponse, errorResponse } from "../utils/response.utils";

/**
 * Notification Controller
 */

export async function handleGetNotifications(req: Request, res: Response) {
  try {
    const userId = req.user!.userId;
    const unreadOnly = req.query.unreadOnly === "true";

    const notifications = await getUserNotifications(userId, unreadOnly);
    return successResponse(res, notifications, "Notifications retrieved", 200);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

export async function handleGetUnreadCount(req: Request, res: Response) {
  try {
    const userId = req.user!.userId;
    const count = await getUnreadCount(userId);
    return successResponse(res, { count }, "Unread count retrieved", 200);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

export async function handleMarkAsRead(req: Request, res: Response) {
  try {
    const userId = req.user!.userId;
    const notificationId = req.params.id as string;

    const notification = await markAsRead(notificationId, userId);
    return successResponse(res, notification, "Notification marked as read", 200);
  } catch (error: any) {
    return errorResponse(res, error.message, 404);
  }
}

export async function handleMarkAllAsRead(req: Request, res: Response) {
  try {
    const userId = req.user!.userId;
    await markAllAsRead(userId);
    return successResponse(res, null, "All notifications marked as read", 200);
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}

export async function handleDeleteNotification(req: Request, res: Response) {
  try {
    const userId = req.user!.userId;
    const notificationId = req.params.id as string;

    await deleteNotification(notificationId, userId);
    return successResponse(res, null, "Notification deleted", 200);
  } catch (error: any) {
    return errorResponse(res, error.message, 404);
  }
}
