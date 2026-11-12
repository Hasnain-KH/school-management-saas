import express from "express";
import * as controller from "../controllers/notification.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission, requireTenant } from "../middleware/authorization.middleware.js";
import { validate } from "../validators/common.validator.js";
import { notificationParamsSchema, notificationQuerySchema } from "../validators/notification.validator.js";

const router = express.Router();
router.use(requireAuth, requireTenant, requirePermission("notifications:read"));

router.get("/", validate(notificationQuerySchema, "query"), controller.listNotifications);
router.get("/unread-count", controller.unreadCount);
router.post("/:id/read", validate(notificationParamsSchema, "params"), controller.markRead);
router.post("/read-all", controller.markAllRead);

export default router;
