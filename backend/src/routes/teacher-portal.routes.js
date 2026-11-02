import express from "express";
import { z } from "zod";
import { examRoster } from "../controllers/teacher-portal.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePlanFeature, requireRoles, requireTenant } from "../middleware/authorization.middleware.js";
import { objectIdSchema, validate } from "../validators/common.validator.js";

const router = express.Router();
const paramsSchema = z.object({ examId: objectIdSchema }).strict();
const rosterQuerySchema = z.object({ classSubjectId: objectIdSchema }).strict();
router.use(requireAuth, requireTenant, requireRoles("teacher"), requirePlanFeature("exams"));
router.get("/exams/:examId/roster", validate(paramsSchema, "params"), validate(rosterQuerySchema, "query"), examRoster);

export default router;
