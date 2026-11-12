import * as notificationService from "../services/notification.service.js";
import { sendSuccess } from "../utils/responses.js";

export const listNotifications = async (req, res) =>
    sendSuccess(res, 200, await notificationService.listNotifications(req, req.query));

export const unreadCount = async (req, res) =>
    sendSuccess(res, 200, await notificationService.getUnreadCount(req));

export const markRead = async (req, res) =>
    sendSuccess(res, 200, await notificationService.markNotificationRead(req, req.params.id), "Notification read");

export const markAllRead = async (req, res) =>
    sendSuccess(res, 200, await notificationService.markAllNotificationsRead(req), "Notifications read");
