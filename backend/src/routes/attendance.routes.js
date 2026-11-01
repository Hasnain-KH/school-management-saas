import express from "express";
import * as controller from "../controllers/attendance.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission, requireTenant } from "../middleware/authorization.middleware.js";
import { validate } from "../validators/common.validator.js";
import {
    staffAttendanceMarkSchema,
    staffAttendanceMonthQuerySchema,
    staffAttendanceReportQuerySchema,
    studentAttendanceDayQuerySchema,
    studentAttendanceMarkSchema,
    studentAttendanceMonthQuerySchema
} from "../validators/attendance.validator.js";

const router = express.Router();
router.use(requireAuth, requireTenant);

router.get("/students/monthly", requirePermission("attendance:read"), validate(studentAttendanceMonthQuerySchema, "query"), controller.getStudentAttendanceMonth);
router.get("/students", requirePermission("attendance:read"), validate(studentAttendanceDayQuerySchema, "query"), controller.getStudentAttendanceDay);
router.post("/students", requirePermission("attendance:manage"), validate(studentAttendanceMarkSchema), controller.markStudentAttendance);
router.get("/staff", requirePermission("attendance:read"), validate(staffAttendanceReportQuerySchema, "query"), controller.getStaffAttendanceMonth);
router.get("/staff/me", requirePermission("attendance:read"), validate(staffAttendanceMonthQuerySchema, "query"), controller.getMyStaffAttendanceMonth);
router.post("/staff", requirePermission("attendance:manage"), validate(staffAttendanceMarkSchema), controller.markStaffAttendance);

export default router;
