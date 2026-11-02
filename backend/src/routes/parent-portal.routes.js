import express from "express";
import { z } from "zod";
import * as controller from "../controllers/parent-portal.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePlanFeature, requireTenant } from "../middleware/authorization.middleware.js";
import { objectIdSchema, validate } from "../validators/common.validator.js";

const router = express.Router();
const studentParamsSchema = z.object({ studentId: objectIdSchema }).strict();
const attendanceQuerySchema = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
}).strict().refine(({ from, to }) => !from || !to || to >= from, {
    message: "End date must be on or after start date"
});

router.use(requireAuth, requireTenant);
router.get("/students", requirePlanFeature("students"), controller.students);
router.get("/students/:studentId/attendance", requirePlanFeature("attendance"), validate(studentParamsSchema, "params"), validate(attendanceQuerySchema, "query"), controller.attendance);
router.get("/students/:studentId/fees", requirePlanFeature("fees"), validate(studentParamsSchema, "params"), controller.fees);
router.get("/students/:studentId/results", requirePlanFeature("exams"), validate(studentParamsSchema, "params"), controller.results);

export default router;
