import mongoose from "mongoose";
import Notification, { NotificationType } from "../models/Notification";
import { sendNotification } from "../config/socket";

/**
 * Notification Service
 * Handles notification creation and management
 */

/**
 * Create Notification
 */
export async function createNotification(data: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: any;
}) {
  const notification = await Notification.create(data);

  // Send real-time notification via Socket.io
  sendNotification(data.userId, {
    id: notification._id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    link: notification.link,
    createdAt: notification.createdAt,
    isRead: false
  });

  return notification;
}

/**
 * Get User Notifications
 */
export async function getUserNotifications(
  userId: string,
  unreadOnly: boolean = false,
  limit: number = 20
) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return { notifications: [], unreadCount: 0 };
  }
  const query: any = { userId };
  if (unreadOnly) {
    query.isRead = false;
  }

  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .limit(limit);

  const unreadCount = await Notification.countDocuments({
    userId,
    isRead: false,
  });

  return {
    notifications,
    unreadCount,
  };
}

/**
 * Get Unread Count
 */
export async function getUnreadCount(userId: string) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return 0;
  }
  const count = await Notification.countDocuments({
    userId,
    isRead: false,
  });
  return count;
}

/**
 * Mark Notification as Read
 */
export async function markAsRead(notificationId: string, userId: string) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    throw new Error("Notification not found");
  }

  return notification;
}

/**
 * Mark All as Read
 */
export async function markAllAsRead(userId: string) {
  await Notification.updateMany(
    { userId, isRead: false },
    { isRead: true }
  );

  return true;
}

/**
 * Delete Notification
 */
export async function deleteNotification(
  notificationId: string,
  userId: string
) {
  const result = await Notification.findOneAndDelete({
    _id: notificationId,
    userId,
  });

  if (!result) {
    throw new Error("Notification not found");
  }

  return true;
}

/**
 * Delete All Notifications
 */
export async function deleteAllNotifications(userId: string) {
  await Notification.deleteMany({ userId });
  return true;
}
