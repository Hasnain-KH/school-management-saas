import express from "express";
import * as controller from "../controllers/student-media.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission, requireTenant } from "../middleware/authorization.middleware.js";
import { validate } from "../validators/common.validator.js";
import {
  studentMediaConsentCreateSchema,
  studentMediaConsentQuerySchema,
  studentMediaConsentUpdateSchema,
  studentMediaCreateSchema,
  studentMediaDirectFinalizeSchema,
  studentMediaDirectResubmitAuthorizeSchema,
  studentMediaDirectUploadAuthorizeSchema,
  studentMediaIdParamsSchema,
  studentMediaListQuerySchema,
  studentMediaResubmitSchema,
  studentMediaReviewActionSchema
} from "../validators/student-media.validator.js";

// Upload/review limiters are mandatory. The app factory always injects the
// shared, fail-closed Redis-backed limiters; a process-local fallback would
// give each serverless instance its own budget and must never be used here.
const createStudentMediaRoutes = (options = {}) => {
  const { uploadLimiter, reviewLimiter } = options;
  if (typeof uploadLimiter !== "function" || typeof reviewLimiter !== "function") {
    throw new TypeError("Student media routes require shared upload and review limiters");
  }

  const router = express.Router();
  router.use(requireAuth, requireTenant);

  // Teacher
  router.get("/teacher/students", requirePermission("studentMedia:upload"), controller.listTeacherStudents);
  router.get("/teacher/capabilities", requireAuth, requireTenant, requirePermission("studentMedia:read"), controller.getTeacherUploadCapabilities);
  router.get("/teacher", requirePermission("studentMedia:read"), validate(studentMediaListQuerySchema, "query"), controller.listTeacherMedia);
  router.post("/teacher/upload", requirePermission("studentMedia:upload"), uploadLimiter, validate(studentMediaCreateSchema), controller.createUpload);
  router.post("/teacher/upload-authorize", requirePermission("studentMedia:upload"), uploadLimiter, validate(studentMediaDirectUploadAuthorizeSchema), controller.authorizeDirectUpload);
  router.post("/teacher/upload-finalize", requirePermission("studentMedia:upload"), uploadLimiter, validate(studentMediaDirectFinalizeSchema), controller.finalizeDirectUpload);
  router.post("/teacher/:id/resubmit-authorize", requirePermission("studentMedia:upload"), uploadLimiter, validate(studentMediaIdParamsSchema, "params"), validate(studentMediaDirectResubmitAuthorizeSchema), controller.authorizeDirectResubmit);
  router.post("/teacher/:id/resubmit-finalize", requirePermission("studentMedia:upload"), uploadLimiter, validate(studentMediaIdParamsSchema, "params"), validate(studentMediaDirectFinalizeSchema), controller.finalizeDirectResubmit);
  router.post("/teacher/:id/resubmit", requirePermission("studentMedia:upload"), uploadLimiter, validate(studentMediaIdParamsSchema, "params"), validate(studentMediaResubmitSchema), controller.resubmit);

  // Admin / review
  router.get("/admin/usage", requirePermission("studentMedia:manage"), controller.usageSummary);
  router.get("/admin", requirePermission("studentMedia:review"), validate(studentMediaListQuerySchema, "query"), controller.listAdminQueue);
  router.get("/admin/:id", requirePermission("studentMedia:review"), validate(studentMediaIdParamsSchema, "params"), controller.getAdminDetail);
  router.post("/admin/:id/approve", requirePermission("studentMedia:review"), reviewLimiter, validate(studentMediaIdParamsSchema, "params"), validate(studentMediaReviewActionSchema), controller.approve);
  router.post("/admin/:id/request-changes", requirePermission("studentMedia:review"), reviewLimiter, validate(studentMediaIdParamsSchema, "params"), validate(studentMediaReviewActionSchema), controller.requestChanges);
  router.post("/admin/:id/reject", requirePermission("studentMedia:review"), reviewLimiter, validate(studentMediaIdParamsSchema, "params"), validate(studentMediaReviewActionSchema), controller.reject);
  router.post("/admin/:id/publish", requirePermission("studentMedia:review"), reviewLimiter, validate(studentMediaIdParamsSchema, "params"), validate(studentMediaReviewActionSchema), controller.publish);
  router.post("/admin/:id/archive", requirePermission("studentMedia:manage"), reviewLimiter, validate(studentMediaIdParamsSchema, "params"), validate(studentMediaReviewActionSchema), controller.archive);
  router.post("/admin/:id/remove", requirePermission("studentMedia:manage"), reviewLimiter, validate(studentMediaIdParamsSchema, "params"), validate(studentMediaReviewActionSchema), controller.remove);

  // Parent
  router.get("/parent", requirePermission("studentMedia:read"), validate(studentMediaListQuerySchema, "query"), controller.listParentMedia);
  router.get("/parent/:id", requirePermission("studentMedia:read"), validate(studentMediaIdParamsSchema, "params"), controller.getParentDetail);

  // Secure access (authorized roles only; service enforces object-level)
  router.get("/:id/access", requirePermission("studentMedia:read"), validate(studentMediaIdParamsSchema, "params"), controller.getAccessUrl);

  // Consent
  router.get("/consents", requirePermission("studentMedia:read"), validate(studentMediaConsentQuerySchema, "query"), controller.listConsents);
  router.post("/consents", requirePermission("studentMedia:manage"), reviewLimiter, validate(studentMediaConsentCreateSchema), controller.createConsent);
  router.patch("/consents/:id", requirePermission("studentMedia:manage"), reviewLimiter, validate(studentMediaIdParamsSchema, "params"), validate(studentMediaConsentUpdateSchema), controller.updateConsent);
  router.post("/consents/:id/withdraw", requirePermission("studentMedia:manage"), reviewLimiter, validate(studentMediaIdParamsSchema, "params"), validate(studentMediaReviewActionSchema), controller.withdrawConsent);

  return router;
};

export default createStudentMediaRoutes;
