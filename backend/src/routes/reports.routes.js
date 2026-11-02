import express from "express";
import * as controller from "../controllers/reports.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission, requirePlanFeature, requireTenant } from "../middleware/authorization.middleware.js";
import { validate } from "../validators/common.validator.js";
import {
    attendanceReportQuerySchema,
    financialReportQuerySchema,
    studentRecordsQuerySchema,
    attendanceRecordsQuerySchema,
    feeCollectionRecordsQuerySchema,
    feeDueRecordsQuerySchema,
    classSessionRecordsQuerySchema,
    examResultRecordsQuerySchema
} from "../validators/reports.validator.js";

const router = express.Router();
router.use(requireAuth, requireTenant, requirePermission("reports:read"), requirePlanFeature("reports"));
router.get("/dashboard", controller.getDashboard);
router.get("/students", controller.getStudents);
router.get("/staff", controller.getStaff);
router.get("/attendance", validate(attendanceReportQuerySchema, "query"), controller.getAttendance);
router.get("/academics", controller.getAcademics);
router.get("/finance", validate(financialReportQuerySchema, "query"), controller.getFinance);
router.get("/students/records", validate(studentRecordsQuerySchema, "query"), controller.getStudentRecords);
router.get("/attendance/records", validate(attendanceRecordsQuerySchema, "query"), controller.getAttendanceRecords);
router.get("/finance/collections", validate(feeCollectionRecordsQuerySchema, "query"), controller.getFeeCollectionRecords);
router.get("/finance/dues", validate(feeDueRecordsQuerySchema, "query"), controller.getFeeDueRecords);
router.get("/academics/classes", validate(classSessionRecordsQuerySchema, "query"), controller.getClassSessionRecords);
router.get("/academics/results", validate(examResultRecordsQuerySchema, "query"), controller.getExamResultRecords);

export default router;
