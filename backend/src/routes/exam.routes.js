import express from "express";
import * as controller from "../controllers/exam.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission, requirePlanFeature, requireTenant } from "../middleware/authorization.middleware.js";
import { validate } from "../validators/common.validator.js";
import {
    examCreateSchema,
    examMarksSchema,
    examParamsSchema,
    examQuerySchema,
    examResultsQuerySchema,
    reportCardParamsSchema
} from "../validators/exam.validator.js";

const router = express.Router();
router.use(requireAuth, requireTenant, requirePlanFeature("exams"));

router.get("/", requirePermission("exams:read"), validate(examQuerySchema, "query"), controller.listExams);
router.post("/", requirePermission("exams:manage"), validate(examCreateSchema), controller.createExam);
router.post("/:examId/marks", requirePermission("exams:marks"), validate(examParamsSchema, "params"), validate(examMarksSchema), controller.enterMarks);
router.post("/:examId/publish", requirePermission("exams:manage"), validate(examParamsSchema, "params"), controller.publishResults);
router.get("/:examId/results", requirePermission("exams:read"), validate(examParamsSchema, "params"), validate(examResultsQuerySchema, "query"), controller.getResults);
router.get("/:examId/report-cards/:studentId", requirePermission("exams:read"), validate(reportCardParamsSchema, "params"), controller.getReportCard);
router.get("/:examId/reports/subjects", requirePermission("exams:read"), validate(examParamsSchema, "params"), controller.getSubjectPerformance);

export default router;
