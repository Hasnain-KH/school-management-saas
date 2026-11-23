import { z } from "zod";
import { objectIdSchema } from "./common.validator.js";

export const STUDENT_MEDIA_MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const STUDENT_MEDIA_MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const STUDENT_MEDIA_MAX_CERT_BYTES = 5 * 1024 * 1024;
export const STUDENT_MEDIA_MAX_PROJECT_BYTES = 10 * 1024 * 1024;
export const STUDENT_MEDIA_MAX_BYTES = STUDENT_MEDIA_MAX_VIDEO_BYTES;
export const STUDENT_MEDIA_MAX_VIDEO_SECONDS = 60;

const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;
const mediaTypeEnum = z.enum(["photo", "video", "certificate", "project", "document"]);
const categoryEnum = z.enum(["photo", "video", "certificate", "project", "educational_activity", "school_event", "achievement", "other"]);
const reviewStatusEnum = z.enum(["pending_review", "changes_requested", "approved", "rejected", "archived", "removed"]);
const publicationStatusEnum = z.enum(["draft", "approved_unpublished", "published", "unpublished", "archived", "removed"]);

const maxBytesFor = (mediaType, category) => {
  if (mediaType === "photo" || category === "photo") return STUDENT_MEDIA_MAX_PHOTO_BYTES;
  if (mediaType === "video" || category === "video") return STUDENT_MEDIA_MAX_VIDEO_BYTES;
  if (mediaType === "certificate" || category === "certificate") return STUDENT_MEDIA_MAX_CERT_BYTES;
  return STUDENT_MEDIA_MAX_PROJECT_BYTES;
};

const baseUploadShape = {
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional().default(""),
  teacherNote: z.string().trim().max(2000).optional().default(""),
  mediaType: mediaTypeEnum,
  category: categoryEnum,
  eventDate: z.string().date().optional().nullable(),
  fileName: z.string().trim().min(1).max(240),
  contentType: z.string().trim().min(1).max(120),
  dataBase64: z.string().min(1).max(Math.ceil(STUDENT_MEDIA_MAX_BYTES / 3) * 4 + 16).regex(base64Pattern, "File data must be valid base64"),
  durationSeconds: z.coerce.number().min(0).max(36000).optional().nullable()
};

const validateUploadSizes = (value, ctx) => {
  const max = maxBytesFor(value.mediaType, value.category);
  const padding = value.dataBase64.endsWith("==") ? 2 : value.dataBase64.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((value.dataBase64.length * 3) / 4) - padding;
  if (bytes > max) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `File exceeds the maximum allowed size of ${Math.floor(max / (1024 * 1024))} MB`, path: ["dataBase64"] });
  if ((value.mediaType === "video" || value.category === "video")) {
    if (value.durationSeconds === undefined || value.durationSeconds === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Video duration is required", path: ["durationSeconds"] });
    else if (Number(value.durationSeconds) > STUDENT_MEDIA_MAX_VIDEO_SECONDS) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Videos must be ${STUDENT_MEDIA_MAX_VIDEO_SECONDS} seconds or shorter`, path: ["durationSeconds"] });
  }
};

// Direct upload metadata is validated separately from the base64 payload. The
// bytes, checksum and provider-specific size limits are handled by the upload
// service, so these schemas deliberately do not impose a byte ceiling.
const directUploadShape = {
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional().default(""),
  teacherNote: z.string().trim().max(2000).optional().default(""),
  mediaType: mediaTypeEnum,
  category: categoryEnum,
  eventDate: z.string().date().optional().nullable(),
  fileName: z.string().trim().min(1).max(240),
  contentType: z.string().trim().min(1).max(120),
  byteSize: z.coerce.number().int().positive(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i, "Invalid SHA-256 checksum"),
  durationSeconds: z.coerce.number().min(0).max(36000).optional().nullable()
};

const validateDirectVideoDuration = (value, ctx) => {
  if (value.mediaType !== "video" && value.category !== "video") return;
  if (value.durationSeconds === undefined || value.durationSeconds === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Video duration is required", path: ["durationSeconds"] });
  } else if (Number(value.durationSeconds) <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Video duration must be greater than 0", path: ["durationSeconds"] });
  } else if (Number(value.durationSeconds) > STUDENT_MEDIA_MAX_VIDEO_SECONDS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Videos must be ${STUDENT_MEDIA_MAX_VIDEO_SECONDS} seconds or shorter`, path: ["durationSeconds"] });
  }
};

export const studentMediaDirectUploadAuthorizeSchema = z.object({
  ...directUploadShape,
  studentId: objectIdSchema,
  studentIds: z.array(objectIdSchema).min(1).max(25).optional()
}).strict().superRefine(validateDirectVideoDuration);

export const studentMediaDirectResubmitAuthorizeSchema = z.object({
  ...directUploadShape
}).strict().superRefine(validateDirectVideoDuration);

export const studentMediaDirectFinalizeSchema = z.object({
  uploadId: z.string().uuid(),
  durationSeconds: z.coerce.number().min(0).max(36000).optional().nullable()
}).strict();

export const studentMediaCreateSchema = z.object({
  ...baseUploadShape,
  studentId: objectIdSchema,
  studentIds: z.array(objectIdSchema).min(1).max(25).optional()
}).strict().superRefine(validateUploadSizes);

export const studentMediaResubmitSchema = z.object({
  ...baseUploadShape
}).strict().superRefine(validateUploadSizes);

export const studentMediaIdParamsSchema = z.object({ id: objectIdSchema }).strict();

export const studentMediaListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: reviewStatusEnum.optional(),
  reviewStatus: reviewStatusEnum.optional(),
  publicationStatus: publicationStatusEnum.optional(),
  mediaType: mediaTypeEnum.optional(),
  category: categoryEnum.optional(),
  studentId: objectIdSchema.optional(),
  uploadedBy: objectIdSchema.optional()
}).strict();

export const studentMediaReviewActionSchema = z.object({
  note: z.string().trim().max(1000).optional().default(""),
  reason: z.string().trim().max(1000).optional().default("")
}).strict();

export const studentMediaConsentCreateSchema = z.object({
  studentId: objectIdSchema,
  guardianId: objectIdSchema,
  status: z.enum(["granted", "withdrawn", "blocked"]).default("granted"),
  scope: z.enum(["all", "photos", "videos", "certificates", "projects", "activities", "events", "achievements"]).default("all"),
  categories: z.array(z.string().trim().min(1).max(60)).max(20).optional().default([]),
  notes: z.string().trim().max(1000).optional().default(""),
  consentSource: z.enum(["guardian_portal", "school_recorded_paper", "school_recorded_phone", "school_recorded_in_person", "other"]).optional().default("school_recorded_paper"),
  verificationEvidence: z.string().trim().max(2000).optional().default(""),
  consentingGuardianName: z.string().trim().max(160).optional().default("")
}).strict();

export const studentMediaConsentUpdateSchema = z.object({
  status: z.enum(["granted", "withdrawn", "blocked"]).optional(),
  scope: z.enum(["all", "photos", "videos", "certificates", "projects", "activities", "events", "achievements"]).optional(),
  categories: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  notes: z.string().trim().max(1000).optional(),
  consentSource: z.enum(["guardian_portal", "school_recorded_paper", "school_recorded_phone", "school_recorded_in_person", "other"]).optional(),
  verificationEvidence: z.string().trim().max(2000).optional(),
  consentingGuardianName: z.string().trim().max(160).optional()
}).strict().refine((v) => Object.keys(v).length > 0, { message: "At least one field must be provided" });

export const studentMediaConsentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  studentId: objectIdSchema.optional(),
  guardianId: objectIdSchema.optional(),
  status: z.enum(["granted", "withdrawn", "blocked"]).optional()
}).strict();
