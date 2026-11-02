import express from "express";
import { listSchoolEvents } from "../controllers/audit.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission, requireTenant } from "../middleware/authorization.middleware.js";
import { validate } from "../validators/common.validator.js";
import { auditQuerySchema } from "../validators/audit.validator.js";

const router = express.Router();
router.use(requireAuth, requireTenant, requirePermission("audit:read"));
router.get("/", validate(auditQuerySchema, "query"), listSchoolEvents);

export default router;
