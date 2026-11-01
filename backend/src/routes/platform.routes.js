import express from "express";
import * as controller from "../controllers/platform.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/authorization.middleware.js";
import { validate } from "../validators/common.validator.js";
import {
    planCreateSchema,
    planParamsSchema,
    planQuerySchema,
    planUpdateSchema,
    platformSchoolParamsSchema,
    platformSchoolQuerySchema,
    schoolStatusSchema,
    schoolSubscriptionSchema
} from "../validators/platform.validator.js";

const router = express.Router();
router.use(requireAuth, requirePermission("platform:manage"));

router.get("/plans", validate(planQuerySchema, "query"), controller.listPlans);
router.post("/plans", validate(planCreateSchema), controller.createPlan);
router.patch("/plans/:planId", validate(planParamsSchema, "params"), validate(planUpdateSchema), controller.updatePlan);
router.get("/schools", validate(platformSchoolQuerySchema, "query"), controller.listSchools);
router.patch("/schools/:schoolId/status", validate(platformSchoolParamsSchema, "params"), validate(schoolStatusSchema), controller.updateSchoolStatus);
router.patch("/schools/:schoolId/subscription", validate(platformSchoolParamsSchema, "params"), validate(schoolSubscriptionSchema), controller.updateSchoolSubscription);

export default router;
