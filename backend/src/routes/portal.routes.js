import express from "express";
import { listCalendarEvents } from "../controllers/operations.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePlanFeature, requireTenant } from "../middleware/authorization.middleware.js";
import { validate } from "../validators/common.validator.js";
import { calendarQuerySchema } from "../validators/operations.validator.js";

const router = express.Router();
router.use(requireAuth, requireTenant);
router.get("/calendar", requirePlanFeature("calendar"), validate(calendarQuerySchema, "query"), listCalendarEvents);

export default router;
