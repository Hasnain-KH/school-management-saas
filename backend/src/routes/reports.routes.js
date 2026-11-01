import express from "express";
import * as controller from "../controllers/reports.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission, requirePlanFeature, requireTenant } from "../middleware/authorization.middleware.js";
import { validate } from "../validators/common.validator.js";
import {
    attendanceReportQuerySchema,
    financialReportQuerySchema
} from "../validators/reports.validator.js";

const router = express.Router();
router.use(requireAuth, requireTenant, requirePermission("reports:read"), requirePlanFeature("reports"));
router.get("/dashboard", controller.getDashboard);
router.get("/students", controller.getStudents);
router.get("/staff", controller.getStaff);
router.get("/attendance", validate(attendanceReportQuerySchema, "query"), controller.getAttendance);
router.get("/academics", controller.getAcademics);
router.get("/finance", validate(financialReportQuerySchema, "query"), controller.getFinance);

export default router;
