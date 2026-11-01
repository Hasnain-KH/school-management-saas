import express from "express";
import * as controller from "../controllers/academic.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
    requirePermission,
    requirePlanFeature,
    requireTenant
} from "../middleware/authorization.middleware.js";
import { paginationSchema, validate } from "../validators/common.validator.js";
import {
    academicSessionQuerySchema,
    academicSessionCreateSchema,
    academicSessionUpdateSchema,
    branchCreateSchema,
    branchUpdateSchema,
    classCreateSchema,
    classSubjectCreateSchema,
    classSubjectQuerySchema,
    classTeacherSchema,
    classQuerySchema,
    classUpdateSchema,
    idParamsSchema,
    sectionCreateSchema,
    sectionQuerySchema,
    sectionUpdateSchema,
    subjectCreateSchema,
    subjectQuerySchema,
    subjectUpdateSchema,
    timetableCreateSchema,
    timetableQuerySchema
} from "../validators/academic.validator.js";
import { objectIdSchema } from "../validators/common.validator.js";
import { z } from "zod";

const router = express.Router();
const branchParamsSchema = z.object({ id: objectIdSchema }).strict();
const sectionParamsSchema = z.object({ sectionId: objectIdSchema }).strict();
router.use(requireAuth, requireTenant);

router.get("/branches", requirePermission("academic:read"), requirePlanFeature("academics"), validate(paginationSchema, "query"), controller.listBranches);
router.post("/branches", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(branchCreateSchema), controller.createBranch);
router.patch("/branches/:id", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(branchParamsSchema, "params"), validate(branchUpdateSchema), controller.updateBranch);
router.delete("/branches/:id", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(branchParamsSchema, "params"), controller.deleteBranch);

router.get("/sessions", requirePermission("academic:read"), requirePlanFeature("academics"), validate(academicSessionQuerySchema, "query"), controller.listSessions);
router.post("/sessions", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(academicSessionCreateSchema), controller.createSession);
router.patch("/sessions/:id", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(idParamsSchema, "params"), validate(academicSessionUpdateSchema), controller.updateSession);
router.post("/sessions/:id/activate", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(idParamsSchema, "params"), controller.activateSession);
router.post("/sessions/:id/complete", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(idParamsSchema, "params"), controller.completeSession);

router.get("/classes", requirePermission("academic:read"), validate(classQuerySchema, "query"), requirePlanFeature("academics"), controller.listClasses);
router.post("/classes", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(classCreateSchema), controller.createClass);
router.patch("/classes/:id", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(idParamsSchema, "params"), validate(classUpdateSchema), controller.updateClass);
router.delete("/classes/:id", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(idParamsSchema, "params"), controller.archiveClass);

router.get("/sections", requirePermission("academic:read"), requirePlanFeature("academics"), validate(sectionQuerySchema, "query"), controller.listSections);
router.post("/sections", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(sectionCreateSchema), controller.createSection);
router.patch("/sections/:id", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(idParamsSchema, "params"), validate(sectionUpdateSchema), controller.updateSection);
router.delete("/sections/:id", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(idParamsSchema, "params"), controller.archiveSection);
router.put("/sections/:sectionId/class-teacher", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(sectionParamsSchema, "params"), validate(classTeacherSchema), controller.assignClassTeacher);
router.get("/sections/:sectionId/class-teacher", requirePermission("academic:read"), requirePlanFeature("academics"), validate(sectionParamsSchema, "params"), validate(classTeacherSchema.pick({ academicSessionId: true }), "query"), controller.getClassTeacher);
router.delete("/sections/:sectionId/class-teacher", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(sectionParamsSchema, "params"), validate(classTeacherSchema.pick({ academicSessionId: true }), "query"), controller.removeClassTeacher);

router.get("/subjects", requirePermission("academic:read"), requirePlanFeature("academics"), validate(subjectQuerySchema, "query"), controller.listSubjects);
router.post("/subjects", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(subjectCreateSchema), controller.createSubject);
router.patch("/subjects/:id", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(idParamsSchema, "params"), validate(subjectUpdateSchema), controller.updateSubject);
router.delete("/subjects/:id", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(idParamsSchema, "params"), controller.archiveSubject);

router.get("/class-subjects", requirePermission("academic:read"), requirePlanFeature("academics"), validate(classSubjectQuerySchema, "query"), controller.listClassSubjects);
router.post("/class-subjects", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(classSubjectCreateSchema), controller.assignSubject);
router.delete("/class-subjects/:id", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(idParamsSchema, "params"), controller.removeClassSubject);

router.get("/timetable", requirePermission("academic:read"), requirePlanFeature("academics"), validate(timetableQuerySchema, "query"), controller.listTimetable);
router.post("/timetable", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(timetableCreateSchema), controller.createTimetableEntry);
router.delete("/timetable/:id", requirePermission("academic:manage"), requirePlanFeature("academics"), validate(idParamsSchema, "params"), controller.deleteTimetableEntry);

export default router;
