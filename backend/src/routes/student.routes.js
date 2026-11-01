import express from "express";
import * as controller from "../controllers/student.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission, requireTenant } from "../middleware/authorization.middleware.js";
import { objectIdSchema, validate } from "../validators/common.validator.js";
import {
    guardianCreateSchema,
    guardianQuerySchema,
    guardianUpdateSchema,
    leavingCertificateSchema,
    studentAdmissionSchema,
    studentGuardianQuerySchema,
    studentGuardianSchema,
    studentQuerySchema,
    studentStatusSchema,
    studentTransitionSchema,
    studentUpdateSchema
} from "../validators/student.validator.js";
import { z } from "zod";

const router = express.Router();
const idParams = z.object({ id: objectIdSchema }).strict();
const guardianParams = z.object({ guardianId: objectIdSchema }).strict();
const studentGuardianParams = z.object({
    studentId: objectIdSchema,
    guardianId: objectIdSchema
}).strict();

router.use(requireAuth, requireTenant);

router.get("/", requirePermission("students:read"), validate(studentQuerySchema, "query"), controller.getStudents);
router.post("/", requirePermission("students:manage"), validate(studentAdmissionSchema), controller.admitStudent);

router.get("/guardians", requirePermission("students:read"), validate(guardianQuerySchema, "query"), controller.getGuardians);
router.post("/guardians", requirePermission("students:manage"), validate(guardianCreateSchema), controller.addGuardian);
router.patch("/guardians/:guardianId", requirePermission("students:manage"), validate(guardianParams, "params"), validate(guardianUpdateSchema), controller.editGuardian);
router.delete("/guardians/:guardianId", requirePermission("students:manage"), validate(guardianParams, "params"), controller.archiveGuardian);
router.put("/:studentId/guardians/:guardianId", requirePermission("students:manage"), validate(studentGuardianParams, "params"), validate(studentGuardianSchema), controller.linkGuardian);
router.delete("/:studentId/guardians/:guardianId", requirePermission("students:manage"), validate(studentGuardianParams, "params"), controller.unlinkGuardian);

router.get("/:id", requirePermission("students:read"), validate(idParams, "params"), controller.getStudent);
router.patch("/:id", requirePermission("students:manage"), validate(idParams, "params"), validate(studentUpdateSchema), controller.editStudent);
router.post("/:id/placement", requirePermission("students:manage"), validate(idParams, "params"), validate(studentTransitionSchema), controller.changePlacement);
router.post("/:id/status", requirePermission("students:manage"), validate(idParams, "params"), validate(studentStatusSchema), controller.changeStatus);
router.post("/:id/leaving-certificate", requirePermission("students:manage"), validate(idParams, "params"), validate(leavingCertificateSchema), controller.issueLeavingCertificate);
router.get("/:id/leaving-certificate", requirePermission("students:read"), validate(idParams, "params"), controller.getLeavingCertificate);
router.get("/:id/history", requirePermission("students:read"), validate(idParams, "params"), controller.getHistory);

export default router;
