import { createHash, randomUUID } from "node:crypto";
import AcademicSession from "../models/academic-session.model.js";
import AuditLog from "../models/audit-log.model.js";
import ClassSubject from "../models/class-subject.model.js";
import ClassTeacherAssignment from "../models/class-teacher-assignment.model.js";
import Guardian from "../models/guardian.model.js";
import Student from "../models/student.model.js";
import StudentGuardian from "../models/student-guardian.model.js";
import StudentMedia from "../models/student-media.model.js";
import StudentMediaAccessLog from "../models/student-media-access-log.model.js";
import StudentMediaCleanupTask from "../models/student-media-cleanup-task.model.js";
import StudentMediaConsent from "../models/student-media-consent.model.js";
import StudentMediaDailyUploadBucket from "../models/student-media-daily-upload-bucket.model.js";
import StudentMediaQuota from "../models/student-media-quota.model.js";
import StudentMediaUploadReservation from "../models/student-media-upload-reservation.model.js";
import User from "../models/user.model.js";
import { getDocumentStorageProvider, getDocumentStorageProviderName, isDocumentStorageConfigured } from "./document-storage.provider.js";
import { createNotification, createNotificationsForRoles, createNotificationsForUserIds } from "./notification.service.js";
import { getLinkedStudentIds } from "./parent-portal.service.js";
import { HttpError } from "../utils/http-error.js";
import { withTransaction } from "../utils/transaction.js";
import { detectFileSignature, isDeclaredTypeCompatible } from "../utils/file-signature.js";

const DEFAULT_SIGNED_URL_TTL_SECONDS = 300;
const MIN_SIGNED_URL_TTL_SECONDS = 60;
const MAX_SIGNED_URL_TTL_SECONDS = 3600;
const DAILY_RESERVATION_STALE_MS = 15 * 60 * 1000;
const DIRECT_UPLOAD_AUTH_MAX_SECONDS = 300;
const CLEANUP_LEASE_MS = 15 * 60 * 1000;
const MAX_CLEANUP_ATTEMPTS = 8;

// Optional storage capabilities are detected, never assumed. A provider with
// only the mandatory upload/delete/signed-download contract simply has no
// direct-upload support and keeps the legacy base64 path.
const DEFAULT_STORAGE_CAPABILITIES = Object.freeze({
  directUpload: null,
  objectLookup: false,
  objectRead: false,
  maxUploadBytes: null,
  uploadAuthTtlSeconds: DIRECT_UPLOAD_AUTH_MAX_SECONDS
});

const getStorageCapabilities = (storage) => {
  const reported = typeof storage?.getCapabilities === "function" ? (storage.getCapabilities() || {}) : {};
  return {
    ...DEFAULT_STORAGE_CAPABILITIES,
    ...reported,
    directUpload: typeof storage?.createUploadAuthorization === "function" ? (reported.directUpload || null) : null,
    objectLookup: typeof storage?.getObjectMetadata === "function" ? reported.objectLookup !== false : false,
    objectRead: typeof storage?.readObjectBytes === "function" ? reported.objectRead !== false : false,
    maxUploadBytes: Number.isFinite(Number(reported.maxUploadBytes)) && Number(reported.maxUploadBytes) > 0
      ? Math.floor(Number(reported.maxUploadBytes))
      : null,
    uploadAuthTtlSeconds: Math.min(
      DIRECT_UPLOAD_AUTH_MAX_SECONDS,
      Math.max(30, Math.floor(Number(reported.uploadAuthTtlSeconds) || DIRECT_UPLOAD_AUTH_MAX_SECONDS))
    )
  };
};

export const getDirectUploadReadiness = () => {
  if (!isDocumentStorageConfigured()) {
    return { supported: false, reason: "Storage is not configured", capabilities: { ...DEFAULT_STORAGE_CAPABILITIES } };
  }
  const storage = getDocumentStorageProvider();
  const capabilities = getStorageCapabilities(storage);
  const supported = Boolean(capabilities.directUpload && capabilities.objectLookup && capabilities.objectRead);
  return {
    supported,
    reason: supported ? null : "The configured storage provider does not support verified direct upload",
    storage,
    providerName: getDocumentStorageProviderName(),
    capabilities
  };
};

const assertDirectUploadReady = () => {
  const readiness = getDirectUploadReadiness();
  if (!readiness.supported) {
    const err = new HttpError(503, readiness.reason);
    err.code = "STUDENT_MEDIA_DIRECT_UPLOAD_UNAVAILABLE";
    throw err;
  }
  return readiness;
};

export const getSignedUrlTtlSeconds = () => {
  const raw = process.env.STUDENT_MEDIA_SIGNED_URL_TTL_SECONDS;
  if (raw === undefined || raw === null || String(raw).trim() === "") return DEFAULT_SIGNED_URL_TTL_SECONDS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < MIN_SIGNED_URL_TTL_SECONDS || parsed > MAX_SIGNED_URL_TTL_SECONDS) {
    throw new HttpError(
      503,
      `STUDENT_MEDIA_SIGNED_URL_TTL_SECONDS must be an integer between ${MIN_SIGNED_URL_TTL_SECONDS} and ${MAX_SIGNED_URL_TTL_SECONDS}`
    );
  }
  return parsed;
};

export const MEDIA_LIMITS = Object.freeze({
  photoMaxBytes: 5 * 1024 * 1024,
  videoMaxBytes: 25 * 1024 * 1024,
  certificateMaxBytes: 5 * 1024 * 1024,
  projectMaxBytes: 10 * 1024 * 1024,
  documentMaxBytes: 10 * 1024 * 1024,
  videoMaxSeconds: 60,
  teacherDailyUploadLimit: 5,
  maxAffectedStudents: 25,
  get downloadUrlExpirySeconds() {
    return getSignedUrlTtlSeconds();
  }
});

export const getAppQuotaBytes = () => {
  const raw = Number(process.env.STUDENT_MEDIA_APP_QUOTA_BYTES || 1024 * 1024 * 1024);
  return Number.isFinite(raw) && raw > 0 ? raw : 1024 * 1024 * 1024;
};

const getActualUsedBytes = async (schoolId) => {
  const used = await StudentMedia.aggregate([
    { $match: { schoolId, isActive: true, reviewStatus: { $ne: "removed" } } },
    { $group: { _id: null, totalBytes: { $sum: "$sizeBytes" } } }
  ]);
  return used[0]?.totalBytes || 0;
};

const ensureQuotaCounter = async (schoolId) => {
  const existing = await StudentMediaQuota.findOne({ schoolId }).lean();
  if (existing) return existing;
  const usedBytes = await getActualUsedBytes(schoolId);
  try {
    await StudentMediaQuota.updateOne(
      { schoolId },
      { $setOnInsert: { schoolId, usedBytes } },
      { upsert: true }
    );
  } catch {
    // concurrent initializer - safe to ignore
  }
  return StudentMediaQuota.findOne({ schoolId }).lean();
};

const reserveQuotaBytes = async (schoolId, bytes) => {
  const quotaBytes = getAppQuotaBytes();
  if (quotaBytes <= 0) return { reserved: true, quotaBytes, usedBytes: 0 };
  await ensureQuotaCounter(schoolId);
  // Atomic conditional increment prevents concurrent uploads from exceeding quota.
  const reserved = await StudentMediaQuota.findOneAndUpdate(
    { schoolId, usedBytes: { $lte: quotaBytes - bytes } },
    { $inc: { usedBytes: bytes } },
    { new: true }
  ).lean();
  if (!reserved) {
    const current = await StudentMediaQuota.findOne({ schoolId }).lean();
    const usedBytes = current?.usedBytes ?? await getActualUsedBytes(schoolId);
    const err = new HttpError(409, usedBytes >= quotaBytes
      ? "Application media quota reached. New uploads are blocked until quota is increased. Existing media has been preserved."
      : "This upload would exceed the configured application media quota. Existing media has been preserved.");
    err.code = "STUDENT_MEDIA_QUOTA_EXCEEDED";
    throw err;
  }
  return { reserved: true, quotaBytes, usedBytes: reserved.usedBytes };
};

const releaseQuotaBytes = async (schoolId, bytes) => {
  if (!bytes || bytes <= 0) return;
  await StudentMediaQuota.updateOne({ schoolId }, [{ $set: { usedBytes: { $max: [0, { $subtract: ["$usedBytes", bytes] }] } } }]).catch(() => {});
};

const safeErrorCode = (error) => String(error?.code || error?.name || "UNKNOWN").slice(0, 120);

const cleanupKey = (kind, parts) => `student-media:${kind}:${parts.map((part) => String(part)).join(":")}`;

const upsertCleanupTask = async ({ schoolId, idempotencyKey, kind, phase = "pending", payload = {}, status = "pending" }) => {
  try {
    await StudentMediaCleanupTask.updateOne(
      { schoolId, idempotencyKey },
      { $setOnInsert: { schoolId, idempotencyKey, kind, phase, status, payload, result: {}, attempts: 1 } },
      { upsert: true }
    );
  } catch (error) {
    // Another request can win the unique-key race; the existing task is correct.
    if (error?.code !== 11000) throw error;
  }
};

const getCleanupTask = async (schoolId, idempotencyKey) =>
  StudentMediaCleanupTask.findOne({ schoolId, idempotencyKey }).lean();

const markCleanupTask = async (schoolId, idempotencyKey, update) =>
  StudentMediaCleanupTask.updateOne({ schoolId, idempotencyKey }, { $set: update });

// Reserve quota and durably record the increment in one transaction. A retry
// with the same cleanup key never increments twice.
const reserveQuotaBytesWithCleanup = async (schoolId, bytes, cleanup) => {
  const existing = await getCleanupTask(schoolId, cleanup.idempotencyKey);
  if (existing?.result?.quotaReservedAt) {
    return { reserved: true, alreadyReserved: true, quotaBytes: getAppQuotaBytes(), usedBytes: existing.result.usedBytes ?? 0 };
  }
  await upsertCleanupTask({ ...cleanup, schoolId, kind: cleanup.kind || "direct_upload" });
  const quotaBytes = getAppQuotaBytes();
  if (quotaBytes <= 0) return { reserved: true, quotaBytes, usedBytes: 0 };
  await ensureQuotaCounter(schoolId);
  let result;
  await withTransaction(async (session) => {
    const reserved = await StudentMediaQuota.findOneAndUpdate(
      { schoolId, usedBytes: { $lte: quotaBytes - bytes } },
      { $inc: { usedBytes: bytes } },
      { new: true, session }
    ).lean();
    if (!reserved) {
      const current = await StudentMediaQuota.findOne({ schoolId }).lean();
      const usedBytes = current?.usedBytes ?? await getActualUsedBytes(schoolId);
      const err = new HttpError(409, usedBytes >= quotaBytes
        ? "Application media quota reached. New uploads are blocked until quota is increased. Existing media has been preserved."
        : "This upload would exceed the configured application media quota. Existing media has been preserved.");
      err.code = "STUDENT_MEDIA_QUOTA_EXCEEDED";
      throw err;
    }
    result = { reserved: true, quotaBytes, usedBytes: reserved.usedBytes };
    await StudentMediaCleanupTask.updateOne(
      { schoolId, idempotencyKey: cleanup.idempotencyKey },
      { $set: { "result.quotaReservedAt": new Date(), "result.quotaBytes": bytes, "result.usedBytes": reserved.usedBytes } },
      { session }
    );
  });
  return result;
};

// Quota decrements are not idempotent, so the task result flag and the counter
// change must commit together. Repeated calls return released:false.
export const releaseQuotaOnce = async ({ schoolId, bytes, idempotencyKey, phase = "quota_release" }) => {
  if (!bytes || bytes <= 0) return { released: false };
  const key=`student-media:quota-release:${schoolId}:${idempotencyKey}`;
  await upsertCleanupTask({
    schoolId,
    idempotencyKey: key,
    kind: "quota_release",
    phase,
    payload: { bytes, sourceKey: idempotencyKey }
  });
  const task = await getCleanupTask(schoolId, key);
  if (task?.result?.releasedAt) return { released: false };
  let released = false;
  await withTransaction(async (session) => {
    const current = await StudentMediaCleanupTask.findOne({ schoolId, idempotencyKey: key }).lean();
    if (current?.result?.releasedAt) return;
    await StudentMediaQuota.updateOne(
      { schoolId },
      [{ $set: { usedBytes: { $max: [0, { $subtract: ["$usedBytes", bytes] }] } } }],
      { session }
    );
    await StudentMediaCleanupTask.updateOne(
      { schoolId, idempotencyKey: key },
      { $set: { "result.releasedAt": new Date(), "result.bytes": bytes, status: "done", phase: "done" } },
      { session }
    );
    released = true;
  });
  return { released };
};

const scheduleStorageDeleteOnce = async ({ schoolId, storageKey, storageProvider, sourceKey }) => {
  if (!storageKey) return;
  await upsertCleanupTask({
    schoolId,
    idempotencyKey: cleanupKey("storage_delete", [schoolId, storageKey]),
    kind: "storage_delete",
    phase: "pending",
    payload: { storageKey, storageProvider, sourceKey }
  });
};

const scheduleDailySlotReleaseOnce = async ({ schoolId, reservation, sourceKey }) => {
  if (!reservation) return;
  await upsertCleanupTask({
    schoolId,
    idempotencyKey: cleanupKey("daily_slot_release", [schoolId, reservation.teacherId, reservation.dayKey, reservation.dedupeKey]),
    kind: "daily_slot_release",
    phase: "pending",
    payload: { ...reservation, sourceKey }
  });
};

const scheduleConsentSuspensionOnce = async ({ schoolId, studentId, consentId, scope, mediaId = null }) => {
  const key = cleanupKey("consent_suspension", [schoolId, consentId, scope, studentId, mediaId || "all"]);
  await upsertCleanupTask({
    schoolId,
    idempotencyKey: key,
    kind: "consent_suspension",
    phase: "pending",
    payload: { studentId: String(studentId), consentId: String(consentId), scope, mediaId: mediaId ? String(mediaId) : null }
  });
  return key;
};

const completeConsentSuspensionTask = async (schoolId, key) => {
  if (!key) return;
  await markCleanupTask(schoolId, key, { status: "done", phase: "done" });
};

const getSchoolTimeZone = (school) => {
  // Stable daily period by school timezone when available; documented UTC fallback.
  // School timezone is not yet a first-class schema field; if present in settings/timezone
  // or school.timezone and valid, we use it. Otherwise we fall back to UTC.
  const candidate = school?.settings?.timezone || school?.timezone || null;
  if (typeof candidate === "string" && candidate.trim()) {
    const tz = candidate.trim();
    try {
      Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
      return tz;
    } catch {
      // invalid timezone - fall back to UTC
    }
  }
  return "UTC";
};

export const getDailyUploadDayKey = (date, school) => {
  const tz = getSchoolTimeZone(school);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`; // YYYY-MM-DD
};

const DAILY_RESERVATION_EXPIRES_MS = DAILY_RESERVATION_STALE_MS;

export const cleanupStaleDailyUploadReservations = async ({ schoolId, teacherId, dayKey, now = new Date() } = {}) => {
  const filter = { status: "reserved", expiresAt: { $lte: now } };
  if (schoolId) filter.schoolId = schoolId;
  if (teacherId) filter.teacherId = teacherId;
  if (dayKey) filter.dayKey = dayKey;
  const stale = await StudentMediaUploadReservation.find(filter).select("_id schoolId teacherId dayKey").lean();
  if (!stale.length) return 0;
  let released = 0;
  for (const reservation of stale) {
    const claimed = await StudentMediaUploadReservation.findOneAndUpdate(
      { _id: reservation._id, status: "reserved" },
      { $set: { status: "released", releasedAt: now, releaseReason: "stale" } },
      { new: true }
    ).lean();
    if (!claimed) continue;
    if (claimed.bucketClaimed) {
      await StudentMediaDailyUploadBucket.updateOne(
        { schoolId: reservation.schoolId, teacherId: reservation.teacherId, dayKey: reservation.dayKey, count: { $gt: 0 } },
        { $inc: { count: -1 } }
      ).catch(() => {});
    }
    released += 1;
  }
  if (schoolId && teacherId && dayKey) {
    const bucket = await StudentMediaDailyUploadBucket.findOne({ schoolId, teacherId, dayKey }).lean();
    if (bucket) {
      const activeCount = await StudentMediaUploadReservation.countDocuments({
        schoolId,
        teacherId,
        dayKey,
        $or: [
          { status: "committed" },
          { status: "reserved", expiresAt: { $gt: now } }
        ]
      });
      // Conservative reconciliation: only correct obvious drift when the bucket has
      // been idle long enough that no in-flight claim+persist window is racing.
      const bucketAgeMs = Date.now() - new Date(bucket.updatedAt || bucket.createdAt || now).getTime();
      if (bucket.count > activeCount && bucketAgeMs > 5 * 60 * 1000) {
        await StudentMediaDailyUploadBucket.updateOne(
          { _id: bucket._id, count: { $gt: activeCount } },
          { $set: { count: activeCount } }
        ).catch(() => {});
      }
    }
  }
  return released;
};

const claimDailyBucketSlot = async ({ schoolId, teacherId, dayKey, limit }) => {
  let bucket = await StudentMediaDailyUploadBucket.findOneAndUpdate(
    { schoolId, teacherId, dayKey, count: { $lt: limit } },
    { $inc: { count: 1 }, $setOnInsert: { schoolId, teacherId, dayKey } },
    { new: true, upsert: false }
  ).lean();

  if (!bucket) {
    const existingBucket = await StudentMediaDailyUploadBucket.findOne({ schoolId, teacherId, dayKey }).lean();
    if (!existingBucket) {
      try {
        bucket = await StudentMediaDailyUploadBucket.create({ schoolId, teacherId, dayKey, count: 1 });
        bucket = bucket.toObject ? bucket.toObject() : bucket;
      } catch (error) {
        if (error?.code !== 11000) throw error;
        bucket = await StudentMediaDailyUploadBucket.findOneAndUpdate(
          { schoolId, teacherId, dayKey, count: { $lt: limit } },
          { $inc: { count: 1 } },
          { new: true }
        ).lean();
      }
    }
  }

  if (!bucket) {
    const err = new HttpError(429, "Daily upload limit reached. Please try again later or contact an administrator.");
    err.code = "STUDENT_MEDIA_DAILY_LIMIT_EXCEEDED";
    throw err;
  }
  return bucket;
};

export const reserveDailyUploadSlot = async ({ schoolId, teacherId, dayKey, dedupeKey, limit, now = new Date() }) => {
  await cleanupStaleDailyUploadReservations({ schoolId, teacherId, dayKey, now });
  const expiresAt = new Date(now.getTime() + DAILY_RESERVATION_EXPIRES_MS);

  const existing = await StudentMediaUploadReservation.findOne({ schoolId, teacherId, dayKey, dedupeKey }).lean();
  if (existing?.status === "committed") {
    return { reservation: existing, alreadyCommitted: true, alreadyReserved: false };
  }
  if (existing?.status === "reserved" && existing.expiresAt && new Date(existing.expiresAt) > now) {
    return { reservation: existing, alreadyCommitted: false, alreadyReserved: true };
  }

  if (existing) {
    // Same dedupe key retry after release/expiry: claim bucket first, then
    // atomically flip reservation to reserved. This prevents double-claim for
    // concurrent same-key retries and keeps bucket accounting correct.
    await claimDailyBucketSlot({ schoolId, teacherId, dayKey, limit });
    const reclaimed = await StudentMediaUploadReservation.findOneAndUpdate(
      {
        _id: existing._id,
        dedupeKey,
        $or: [
          { status: "released" },
          { status: "reserved", expiresAt: { $lte: now } }
        ]
      },
      { $set: { status: "reserved", expiresAt, committedAt: null, releasedAt: null, releaseReason: "", bucketClaimed: true } },
      { new: true }
    ).lean();
    if (reclaimed) {
      return { reservation: reclaimed, alreadyCommitted: false, alreadyReserved: false };
    }
    // Another request won the reclaim; release the bucket slot we just claimed.
    await StudentMediaDailyUploadBucket.updateOne(
      { schoolId, teacherId, dayKey, count: { $gt: 0 } },
      { $inc: { count: -1 } }
    ).catch(() => {});
    const current = await StudentMediaUploadReservation.findOne({ schoolId, teacherId, dayKey, dedupeKey }).lean();
    if (current?.status === "committed") return { reservation: current, alreadyCommitted: true, alreadyReserved: false };
    if (current?.status === "reserved" && current.expiresAt && new Date(current.expiresAt) > now) {
      return { reservation: current, alreadyCommitted: false, alreadyReserved: true };
    }
    // Fall through to recursive retry for unexpected states.
    return reserveDailyUploadSlot({ schoolId, teacherId, dayKey, dedupeKey, limit, now: new Date() });
  }

  // New dedupe key: claim bucket first, then persist reservation. If reservation
  // persistence fails, release bucket. This avoids bucket leaks on crash between
  // reservation creation and bucket claim.
  await claimDailyBucketSlot({ schoolId, teacherId, dayKey, limit });
  let reservation;
  try {
    reservation = await StudentMediaUploadReservation.create({
      schoolId,
      teacherId,
      dayKey,
      dedupeKey,
      status: "reserved",
      expiresAt,
      bucketClaimed: true
    });
    reservation = reservation.toObject ? reservation.toObject() : reservation;
  } catch (error) {
    await StudentMediaDailyUploadBucket.updateOne(
      { schoolId, teacherId, dayKey, count: { $gt: 0 } },
      { $inc: { count: -1 } }
    ).catch(() => {});
    if (error?.code !== 11000) throw error;
    const current = await StudentMediaUploadReservation.findOne({ schoolId, teacherId, dayKey, dedupeKey }).lean();
    if (current?.status === "committed") return { reservation: current, alreadyCommitted: true, alreadyReserved: false };
    if (current?.status === "reserved" && current.expiresAt && new Date(current.expiresAt) > now) {
      return { reservation: current, alreadyCommitted: false, alreadyReserved: true };
    }
    return reserveDailyUploadSlot({ schoolId, teacherId, dayKey, dedupeKey, limit, now: new Date() });
  }

  return { reservation, alreadyCommitted: false, alreadyReserved: false };
};

export const commitDailyUploadSlot = async ({ schoolId, teacherId, dayKey, dedupeKey, mediaId = null, now = new Date() }) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await StudentMediaUploadReservation.updateOne(
        { schoolId, teacherId, dayKey, dedupeKey, status: "reserved" },
        { $set: { status: "committed", committedAt: now, releaseReason: "", ...(mediaId ? { mediaId } : {}) } }
      );
      if (res?.modifiedCount || res?.matchedCount) return;
    } catch {
      // retry once; commit must not roll back an already-created upload
    }
  }
};

export const releaseDailyUploadSlot = async ({ schoolId, teacherId, dayKey, dedupeKey, reason = "released", now = new Date() }) => {
  const released = await StudentMediaUploadReservation.findOneAndUpdate(
    { schoolId, teacherId, dayKey, dedupeKey, status: "reserved" },
    { $set: { status: "released", releasedAt: now, releaseReason: String(reason).slice(0, 120) } },
    { new: true }
  ).lean();
  if (released) {
    await StudentMediaDailyUploadBucket.updateOne(
      { schoolId, teacherId, dayKey, count: { $gt: 0 } },
      { $inc: { count: -1 } }
    ).catch(() => {});
  }
  return released;
};

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const CERT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const PROJECT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip"
]);

const CATEGORY_TO_SCOPE = {
  photo: "photos",
  video: "videos",
  certificate: "certificates",
  project: "projects",
  educational_activity: "activities",
  school_event: "events",
  achievement: "achievements",
  other: "all"
};

const assertTenant = (req) => {
  if (!req.user?.schoolId || !req.school || String(req.user.schoolId) !== String(req.school._id)) {
    throw new HttpError(403, "A matching school tenant context is required");
  }
  return req.school._id;
};

const pageInfo = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });
const safeString = (value, max = 2000) => String(value ?? "").trim().slice(0, max);
const oid = (value) => String(value);

const sanitizeFileName = (name) => String(name || "upload").replace(/[^\w.\-]+/g, "_").slice(-120);

const writeAudit = async (req, { action, resourceId = null, metadata = {}, session = null }) => {
  const log = new AuditLog({
    schoolId: req.user?.schoolId ?? null,
    actorUserId: req.user?._id ?? null,
    action,
    resourceType: "student_media",
    resourceId,
    metadata
  });
  await log.save(session ? { session } : undefined);
};

const logAccess = async ({ schoolId, mediaId, actorUserId, actorRole, action, outcome, reason = "", metadata = {} }) => {
  try {
    await StudentMediaAccessLog.create({ schoolId, mediaId, actorUserId, actorRole, action, outcome, reason, metadata });
  } catch {
    // Access logging must never block the authorized response.
  }
};

const allowedTypesFor = (mediaType, category) => {
  if (mediaType === "photo" || category === "photo") return PHOTO_TYPES;
  if (mediaType === "video" || category === "video") return VIDEO_TYPES;
  if (mediaType === "certificate" || category === "certificate") return CERT_TYPES;
  return PROJECT_TYPES;
};

const maxBytesFor = (mediaType, category) => {
  if (mediaType === "photo" || category === "photo") return MEDIA_LIMITS.photoMaxBytes;
  if (mediaType === "video" || category === "video") return MEDIA_LIMITS.videoMaxBytes;
  if (mediaType === "certificate" || category === "certificate") return MEDIA_LIMITS.certificateMaxBytes;
  if (mediaType === "document") return MEDIA_LIMITS.documentMaxBytes;
  return MEDIA_LIMITS.projectMaxBytes;
};

export const effectiveMaxBytesFor = (mediaType, category, capabilities = null) => {
  const appMax = maxBytesFor(mediaType, category);
  const providerMax = Number(capabilities?.maxUploadBytes);
  return Number.isFinite(providerMax) && providerMax > 0 ? Math.min(appMax, providerMax) : appMax;
};

const validateUpload = (input, buffer, capabilities = null) => {
  const mediaType = input.mediaType;
  const category = input.category;
  const allowed = allowedTypesFor(mediaType, category);
  if (!allowed.has(input.contentType)) {
    throw new HttpError(400, "This file type is not allowed for the selected media category");
  }
  const maxBytes = effectiveMaxBytesFor(mediaType, category, capabilities);
  if (buffer.length > maxBytes) {
    throw new HttpError(400, `File exceeds the maximum allowed size of ${Math.floor(maxBytes / (1024 * 1024))} MB`);
  }
  const detected = detectFileSignature(buffer);
  if (!isDeclaredTypeCompatible(input.contentType, detected)) {
    throw new HttpError(400, "The file content does not match the declared file type");
  }
  if (mediaType === "video" || category === "video") {
    const duration = Number(input.durationSeconds);
    if (!Number.isFinite(duration) || duration <= 0) throw new HttpError(400, "Video duration is required");
    if (duration > MEDIA_LIMITS.videoMaxSeconds) throw new HttpError(400, `Videos must be ${MEDIA_LIMITS.videoMaxSeconds} seconds or shorter`);
  }
};

const getTeacherAuthorizedStudentIds = async (schoolId, teacherUserId) => {
  // Assignment is always resolved against the school's single active session.
  // A server-derived session (never a client parameter) and fail-closed behavior
  // prevent completed-session assignments from granting indefinite access.
  const activeSession = await AcademicSession.findOne({ schoolId, status: "active" })
    .select("_id")
    .lean();
  if (!activeSession) return [];
  const activeSessionId = activeSession._id;
  const [classTeacher, classSubjects] = await Promise.all([
    ClassTeacherAssignment
      .find({ schoolId, academicSessionId: activeSessionId, teacherId: teacherUserId })
      .select("sectionId")
      .lean(),
    ClassSubject
      .find({ schoolId, academicSessionId: activeSessionId, teacherId: teacherUserId, isActive: true })
      .select("classId")
      .lean()
  ]);
  const sectionIds = [...new Set(classTeacher.map((r) => String(r.sectionId)))];
  const classIds = [...new Set(classSubjects.map((r) => String(r.classId)))];
  const or = [];
  if (sectionIds.length) or.push({ sectionId: { $in: sectionIds } });
  if (classIds.length) or.push({ classId: { $in: classIds } });
  if (!or.length) return [];
  const students = await Student.find({
    schoolId,
    academicSessionId: activeSessionId,
    status: { $in: ["enrolled", "graduated"] },
    $or: or
  }).select("_id").lean();
  return [...new Set(students.map((s) => String(s._id)))];
};

const assertTeacherCanAccessStudents = async (req, schoolId, studentIds) => {
  if (req.user.role !== "teacher") return;
  const allowed = await getTeacherAuthorizedStudentIds(schoolId, req.user._id);
  const missing = studentIds.filter((id) => !allowed.includes(String(id)));
  if (missing.length) throw new HttpError(403, "You do not have permission to upload media for one or more selected students");
};

const assertStudentsInSchool = async (schoolId, studentIds) => {
  const unique = [...new Set(studentIds.map(String))];
  const students = await Student.find({ schoolId, _id: { $in: unique } }).select("_id status").lean();
  if (students.length !== unique.length) throw new HttpError(404, "One or more selected students were not found in this school");
  return students;
};

const mediaPublic = (media, extra = {}) => ({
  id: String(media._id),
  schoolId: String(media.schoolId),
  studentIds: (media.studentIds || []).map(String),
  primaryStudentId: String(media.primaryStudentId),
  uploadedBy: String(media.uploadedBy),
  uploadedByRole: media.uploadedByRole,
  mediaType: media.mediaType,
  category: media.category,
  title: media.title,
  description: media.description || "",
  teacherNote: media.teacherNote || "",
  eventDate: media.eventDate || null,
  fileName: media.fileName,
  contentType: media.contentType,
  sizeBytes: media.sizeBytes,
  durationSeconds: media.durationSeconds ?? null,
  reviewStatus: media.reviewStatus,
  publicationStatus: media.publicationStatus,
  consentStatus: media.consentStatus,
  reviewNote: media.reviewNote || "",
  rejectionReason: media.rejectionReason || "",
  changeRequestReason: media.changeRequestReason || "",
  reviewedAt: media.reviewedAt || null,
  publishedAt: media.publishedAt || null,
  createdAt: media.createdAt,
  updatedAt: media.updatedAt,
  ...extra
});

const getConsentForStudents = async (schoolId, studentIds) => {
  return StudentMediaConsent.find({ schoolId, studentId: { $in: studentIds }, isActive: true }).lean();
};

const hasGrantedConsent = (consents, studentId, category) => {
  const scope = CATEGORY_TO_SCOPE[category] || "all";
  return consents.some((c) =>
    String(c.studentId) === String(studentId)
    && c.status === "granted"
    && (c.scope === "all" || c.scope === scope || (Array.isArray(c.categories) && c.categories.includes(category)))
  );
};

export const evaluateMediaConsent = async (schoolId, media) => {
  const studentIds = (media.studentIds || []).map(String);
  const consents = await getConsentForStudents(schoolId, studentIds);
  const missing = [];
  const withdrawn = [];
  const blocked = [];
  for (const studentId of studentIds) {
    const studentConsents = consents.filter((c) => String(c.studentId) === String(studentId));
    // "blocked" is an explicit denial and must never be overridden by another
    // active grant for the same student.
    if (studentConsents.some((c) => c.status === "blocked")) blocked.push(studentId);
    if (studentConsents.some((c) => c.status === "withdrawn")) withdrawn.push(studentId);
    if (!hasGrantedConsent(consents, studentId, media.category)) missing.push(studentId);
  }
  return {
    ok: missing.length === 0 && withdrawn.length === 0 && blocked.length === 0,
    missingStudentIds: missing,
    withdrawnStudentIds: withdrawn,
    blockedStudentIds: blocked,
    consents
  };
};

const consentFailureReason = (consent) => {
  if (consent.blockedStudentIds.length) return "one or more affected students have blocked consent";
  if (consent.withdrawnStudentIds.length) return "consent has been withdrawn for one or more affected students";
  return "required guardian consent is missing for one or more affected students";
};

const assertPublishable = async (schoolId, media) => {
  if (media.reviewStatus !== "approved") throw new HttpError(409, "Media must be approved before it can be published");
  if (media.publicationStatus === "published") throw new HttpError(409, "Media is already published");
  if (media.isActive === false || media.reviewStatus === "removed") throw new HttpError(409, "Removed media cannot be published");
  if ((media.mediaType === "video" || media.category === "video") && media.durationVerified !== true) {
    throw new HttpError(409, "Video duration is unverified. Publication is blocked until trusted provider metadata confirms it.");
  }
  const consent = await evaluateMediaConsent(schoolId, media);
  if (!consent.ok) {
    const detail = consentFailureReason(consent);
    throw new HttpError(409, `${detail.charAt(0).toUpperCase()}${detail.slice(1)}`);
  }
  return consent;
};

const recordHistory = (media, entry) => {
  media.reviewHistory = [...(media.reviewHistory || []), { ...entry, at: new Date() }];
};

const notifyUsers = async ({ schoolId, userIds, type = "media", title, body, data = {}, dedupeKey = null }) => {
  await createNotificationsForUserIds({ schoolId, userIds, type, title, body, data, dedupeKey });
};

const parentUserIdsForStudents = async (schoolId, studentIds) => {
  const guardians = await Guardian.find({ schoolId, isActive: true, userId: { $ne: null } }).select("_id userId").lean();
  if (!guardians.length) return [];
  const guardianIds = guardians.map((g) => g._id);
  const links = await StudentGuardian.find({ schoolId, guardianId: { $in: guardianIds }, studentId: { $in: studentIds } }).select("guardianId studentId").lean();
  const guardianUserById = new Map(guardians.map((g) => [String(g._id), String(g.userId)]));
  const userIds = new Set();
  for (const link of links) {
    const uid = guardianUserById.get(String(link.guardianId));
    if (uid) userIds.add(uid);
  }
  return [...userIds];
};

export const createStudentMediaUpload = async (req, input) => {
  const schoolId = assertTenant(req);
  if (!["teacher", "school_admin", "principal"].includes(req.user.role)) {
    throw new HttpError(403, "You do not have permission to upload student media");
  }
  const studentIds = [...new Set((input.studentIds || [input.studentId]).filter(Boolean).map(String))];
  if (!studentIds.length) throw new HttpError(400, "At least one student is required");
  if (studentIds.length > MEDIA_LIMITS.maxAffectedStudents) throw new HttpError(400, "Too many affected students selected");
  const primaryStudentId = String(input.studentId || studentIds[0]);
  if (!studentIds.includes(primaryStudentId)) studentIds.unshift(primaryStudentId);

  await assertStudentsInSchool(schoolId, studentIds);
  await assertTeacherCanAccessStudents(req, schoolId, studentIds);

  // Resolve storage before holding quota or a daily slot. If storage is not
  // configured, no compensating release is needed because nothing was reserved.
  const providerName = getDocumentStorageProviderName();
  const storage = getDocumentStorageProvider();
  const capabilities = getStorageCapabilities(storage);

  const buffer = Buffer.from(input.dataBase64, "base64");
  if (!buffer.length) throw new HttpError(400, "The uploaded file is empty");
  validateUpload(input, buffer, capabilities);

  // Duplicate submission prevention: same uploader+checksum+primary student within 10 minutes.
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const recent = await StudentMedia.findOne({
    schoolId, uploadedBy: req.user._id, primaryStudentId, checksum, isActive: true,
    createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
  }).lean();
  if (recent) {
    throw new HttpError(409, "A similar upload was recently submitted. Please check your upload history before trying again.");
  }

  // Teacher daily upload limit: atomic reservation before storage upload.
  // Reservation is scoped by schoolId+teacherId+dayKey (school timezone when available,
  // otherwise documented UTC fallback). The reservation dedupe key prevents retries from
  // consuming multiple slots. Stale/abandoned reservations expire and are cleaned up.
  // Resubmissions with a new file (resubmitMedia) do not consume an additional daily
  // slot because they replace an already-submitted media item in its review lifecycle.
  let dailyReservation = null;
  if (req.user.role === "teacher") {
    const dayKey = getDailyUploadDayKey(new Date(), req.school);
    const dedupeKey = createHash("sha256")
      .update(`teacher-upload:${schoolId}:${req.user._id}:${dayKey}:${checksum}:${primaryStudentId}`)
      .digest("hex")
      .slice(0, 64);
    const reserved = await reserveDailyUploadSlot({
      schoolId,
      teacherId: req.user._id,
      dayKey,
      dedupeKey,
      limit: MEDIA_LIMITS.teacherDailyUploadLimit
    });
    if (reserved.alreadyCommitted || reserved.alreadyReserved) {
      throw new HttpError(409, "A similar upload was recently submitted. Please check your upload history before trying again.");
    }
    dailyReservation = { schoolId, teacherId: req.user._id, dayKey, dedupeKey };
  }

  // Reserve per-tenant quota atomically before storage upload to prevent concurrent overage.
  let quotaReservedBytes = 0;
  try {
    await reserveQuotaBytes(schoolId, buffer.length);
    quotaReservedBytes = buffer.length;
  } catch (error) {
    if (dailyReservation) await releaseDailyUploadSlot({ ...dailyReservation, reason: "quota-reserve-failed" });
    throw error;
  }

  const storageKey = `${schoolId}/student-media/${randomUUID()}-${sanitizeFileName(input.fileName)}`;
  try {
    await storage.upload({ key: storageKey, body: buffer, contentType: input.contentType });
  } catch (error) {
    await releaseQuotaBytes(schoolId, quotaReservedBytes);
    quotaReservedBytes = 0;
    if (dailyReservation) await releaseDailyUploadSlot({ ...dailyReservation, reason: "storage-upload-failed" });
    throw error;
  }

  try {
    const created = await withTransaction(async (session) => {
      const consent = await evaluateMediaConsent(schoolId, { studentIds, category: input.category });
      const media = new StudentMedia({
        schoolId,
        studentIds,
        primaryStudentId,
        uploadedBy: req.user._id,
        uploadedByRole: req.user.role,
        mediaType: input.mediaType,
        category: input.category,
        title: safeString(input.title, 160),
        description: safeString(input.description, 2000),
        teacherNote: safeString(input.teacherNote, 2000),
        eventDate: input.eventDate ? new Date(input.eventDate) : null,
        fileName: safeString(input.fileName, 240),
        contentType: input.contentType,
        sizeBytes: buffer.length,
        durationSeconds: input.durationSeconds ?? null,
        durationVerified: false,
        durationSource: "unverified",
        metadataVerifiedAt: null,
        uploadMode: "base64",
        storageProvider: providerName,
        storageKey,
        checksum,
        reviewStatus: "pending_review",
        publicationStatus: "draft",
        consentStatus: consent.ok ? "verified" : (consent.blockedStudentIds.length ? "blocked" : (consent.withdrawnStudentIds.length ? "withdrawn" : "pending")),
        reviewHistory: [{
          action: "submitted",
          actorUserId: req.user._id,
          actorRole: req.user.role,
          note: "Media submitted for admin review",
          at: new Date()
        }]
      });
      await media.save({ session });
      await writeAudit(req, { action: "student_media.submitted", resourceId: media._id, metadata: { mediaType: media.mediaType, category: media.category, studentCount: studentIds.length, sizeBytes: buffer.length }, session });
      return media;
    });

    if (dailyReservation) await commitDailyUploadSlot({ ...dailyReservation, mediaId: created._id });

    await createNotificationsForRoles({
      schoolId,
      roles: ["school_admin", "principal"],
      type: "media",
      title: "New student media awaiting review",
      body: `${safeString(input.title, 80)} was submitted and is waiting for review.`,
      data: { mediaId: String(created._id), kind: "student_media_submitted" },
      dedupeKey: `student-media-submitted:${created._id}`
    }).catch(() => {});

    return mediaPublic(created);
  } catch (error) {
    await storage.delete({ key: storageKey }).catch(() => {});
    await releaseQuotaBytes(schoolId, quotaReservedBytes);
    if (dailyReservation) await releaseDailyUploadSlot({ ...dailyReservation, reason: "db-create-failed" });
    throw error;
  }
};

const canTeacherAccessMedia = async (schoolId, userId, media) => {
  // Uploading a file is not a permanent grant: access follows current
  // class/section assignments, so a teacher who loses an assignment cannot
  // keep opening that student's media by relying on the uploader field.
  // Every affected student must remain assigned; one stale student must not
  // keep a multi-student record visible.
  const allowed = await getTeacherAuthorizedStudentIds(schoolId, userId);
  const studentIds = (media.studentIds || []).map(String);
  return studentIds.length > 0 && studentIds.every((id) => allowed.includes(id));
};

export const listTeacherMedia = async (req, input = {}) => {
  const schoolId = assertTenant(req);
  const filter = { schoolId, isActive: true };
  if (req.user.role === "teacher") {
    filter.uploadedBy = req.user._id;
    const allowed = await getTeacherAuthorizedStudentIds(schoolId, req.user._id);
    filter.$and = [...(filter.$and ?? []), { studentIds: { $in: allowed } }];
    if (!allowed.length) {
      return { items: [], pagination: pageInfo(input.page ?? 1, input.limit ?? 20, 0) };
    }
  }
  if (input.status) filter.reviewStatus = input.status;
  if (input.mediaType) filter.mediaType = input.mediaType;
  if (input.category) filter.category = input.category;
  if (input.studentId) filter.studentIds = input.studentId;
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;
  const [items, total] = await Promise.all([
    StudentMedia.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    StudentMedia.countDocuments(filter)
  ]);
  return { items: items.map((m) => mediaPublic(m)), pagination: pageInfo(page, limit, total) };
};

export const listTeacherAuthorizedStudents = async (req) => {
  const schoolId = assertTenant(req);
  if (!["teacher", "school_admin", "principal"].includes(req.user.role)) throw new HttpError(403, "Forbidden");
  let filter = { schoolId, status: { $in: ["enrolled", "graduated"] } };
  if (req.user.role === "teacher") {
    const ids = await getTeacherAuthorizedStudentIds(schoolId, req.user._id);
    filter = { ...filter, _id: { $in: ids } };
  }
  const students = await Student.find(filter).select("_id firstName lastName admissionNumber classId sectionId status").sort({ lastName: 1, firstName: 1 }).limit(500).lean();
  return students.map((s) => ({ id: String(s._id), firstName: s.firstName, lastName: s.lastName, admissionNumber: s.admissionNumber, classId: String(s.classId), sectionId: String(s.sectionId), status: s.status }));
};

export const getAdminMediaQueue = async (req, input = {}) => {
  const schoolId = assertTenant(req);
  const filter = { schoolId, isActive: true };
  if (input.reviewStatus) filter.reviewStatus = input.reviewStatus;
  if (input.publicationStatus) filter.publicationStatus = input.publicationStatus;
  if (input.mediaType) filter.mediaType = input.mediaType;
  if (input.category) filter.category = input.category;
  if (input.studentId) filter.studentIds = input.studentId;
  if (input.uploadedBy) filter.uploadedBy = input.uploadedBy;
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;
  const [items, total] = await Promise.all([
    StudentMedia.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    StudentMedia.countDocuments(filter)
  ]);
  return { items: items.map((m) => mediaPublic(m)), pagination: pageInfo(page, limit, total) };
};

export const getAdminMediaDetail = async (req, id) => {
  const schoolId = assertTenant(req);
  const media = await StudentMedia.findOne({ _id: id, schoolId, isActive: true }).lean();
  if (!media) throw new HttpError(404, "Media was not found");
  const [students, uploader, consents] = await Promise.all([
    Student.find({ schoolId, _id: { $in: media.studentIds } }).select("_id firstName lastName admissionNumber classId sectionId").lean(),
    User.findOne({ _id: media.uploadedBy, schoolId }).select("_id name email role").lean(),
    getConsentForStudents(schoolId, media.studentIds)
  ]);
  const consentEval = await evaluateMediaConsent(schoolId, media);
  return {
    media: mediaPublic(media),
    students: students.map((s) => ({ id: String(s._id), firstName: s.firstName, lastName: s.lastName, admissionNumber: s.admissionNumber })),
    uploader: uploader ? { id: String(uploader._id), name: uploader.name, email: uploader.email, role: uploader.role } : null,
    consent: { ok: consentEval.ok, missingStudentIds: consentEval.missingStudentIds, withdrawnStudentIds: consentEval.withdrawnStudentIds },
    consentRecords: consents.map((c) => ({ id: String(c._id), studentId: String(c.studentId), guardianId: String(c.guardianId), status: c.status, scope: c.scope, categories: c.categories || [], updatedAt: c.updatedAt })),
    reviewHistory: (media.reviewHistory || []).map((h) => ({ ...h, actorUserId: String(h.actorUserId), at: h.at }))
  };
};

const getMediaForAdminAction = async (req, id) => {
  const schoolId = assertTenant(req);
  const media = await StudentMedia.findOne({ _id: id, schoolId, isActive: true });
  if (!media) throw new HttpError(404, "Media was not found");
  return media;
};

const adminActionCommon = async (req, media, updates, historyAction, auditAction, note = "", reason = "") => {
  recordHistory(media, { action: historyAction, actorUserId: req.user._id, actorRole: req.user.role, note, reason });
  Object.assign(media, updates);
  await media.save();
  await writeAudit(req, { action: auditAction, resourceId: media._id, metadata: { reviewStatus: media.reviewStatus, publicationStatus: media.publicationStatus, note, reason } });
  return media;
};

export const approveMedia = async (req, id, input = {}) => {
  const media = await getMediaForAdminAction(req, id);
  if (!["pending_review", "changes_requested"].includes(media.reviewStatus)) throw new HttpError(409, "Only pending or changes-requested media can be approved");
  const consent = await evaluateMediaConsent(req.school._id, media);
  const updated = await adminActionCommon(req, media, {
    reviewStatus: "approved",
    publicationStatus: "approved_unpublished",
    consentStatus: consent.ok ? "verified" : (consent.blockedStudentIds.length ? "blocked" : (consent.withdrawnStudentIds.length ? "withdrawn" : "pending")),
    consentCheckedAt: new Date(),
    consentCheckedBy: req.user._id,
    reviewNote: safeString(input.note, 1000),
    rejectionReason: "",
    changeRequestReason: "",
    reviewedBy: req.user._id,
    reviewedAt: new Date()
  }, "approved", "student_media.approved", safeString(input.note, 1000));
  await createNotification({ schoolId: req.school._id, userId: media.uploadedBy, type: "media", title: "Media approved", body: `${media.title} was approved. It can be published after consent verification.`, data: { mediaId: String(media._id), kind: "student_media_approved" }, dedupeKey: `student-media-approved:${media._id}` }).catch(() => {});
  return mediaPublic(updated);
};

export const requestMediaChanges = async (req, id, input = {}) => {
  const media = await getMediaForAdminAction(req, id);
  if (!["pending_review", "approved"].includes(media.reviewStatus)) throw new HttpError(409, "This media cannot be moved to changes requested from its current state");
  const reason = safeString(input.reason, 1000);
  if (!reason) throw new HttpError(400, "A reason is required when requesting changes");
  const updated = await adminActionCommon(req, media, {
    reviewStatus: "changes_requested",
    publicationStatus: "draft",
    changeRequestReason: reason,
    reviewNote: safeString(input.note, 1000),
    reviewedBy: req.user._id,
    reviewedAt: new Date(),
    publishedAt: null,
    publishedBy: null
  }, "changes_requested", "student_media.changes_requested", safeString(input.note, 1000), reason);
  await createNotification({ schoolId: req.school._id, userId: media.uploadedBy, type: "media", title: "Changes requested for media", body: `${media.title}: ${reason}`, data: { mediaId: String(media._id), kind: "student_media_changes_requested" }, dedupeKey: `student-media-changes:${media._id}` }).catch(() => {});
  return mediaPublic(updated);
};

export const rejectMedia = async (req, id, input = {}) => {
  const media = await getMediaForAdminAction(req, id);
  if (!["pending_review", "changes_requested", "approved"].includes(media.reviewStatus)) throw new HttpError(409, "This media cannot be rejected from its current state");
  const reason = safeString(input.reason, 1000);
  if (!reason) throw new HttpError(400, "A rejection reason is required");
  const updated = await adminActionCommon(req, media, {
    reviewStatus: "rejected",
    publicationStatus: "unpublished",
    rejectionReason: reason,
    reviewNote: safeString(input.note, 1000),
    reviewedBy: req.user._id,
    reviewedAt: new Date(),
    publishedAt: null,
    publishedBy: null
  }, "rejected", "student_media.rejected", safeString(input.note, 1000), reason);
  await createNotification({ schoolId: req.school._id, userId: media.uploadedBy, type: "media", title: "Media rejected", body: `${media.title}: ${reason}`, data: { mediaId: String(media._id), kind: "student_media_rejected" }, dedupeKey: `student-media-rejected:${media._id}` }).catch(() => {});
  return mediaPublic(updated);
};

export const publishMedia = async (req, id, input = {}) => {
  const media = await getMediaForAdminAction(req, id);
  await assertPublishable(req.school._id, media);
  const updated = await adminActionCommon(req, media, {
    reviewStatus: "approved",
    publicationStatus: "published",
    consentStatus: "verified",
    consentCheckedAt: new Date(),
    consentCheckedBy: req.user._id,
    publishedBy: req.user._id,
    publishedAt: new Date(),
    reviewNote: safeString(input.note, 1000) || media.reviewNote
  }, "published", "student_media.published", safeString(input.note, 1000));
  const parentUserIds = await parentUserIdsForStudents(req.school._id, media.studentIds);
  if (parentUserIds.length) {
    await notifyUsers({
      schoolId: req.school._id,
      userIds: parentUserIds,
      type: "media",
      title: "New moment available for your child",
      body: `${media.title} has been published to your child's portfolio.`,
      data: { mediaId: String(media._id), kind: "student_media_published" },
      dedupeKey: `student-media-published:${media._id}`
    }).catch(() => {});
  }
  await createNotification({ schoolId: req.school._id, userId: media.uploadedBy, type: "media", title: "Media published", body: `${media.title} is now published.`, data: { mediaId: String(media._id), kind: "student_media_published_teacher" }, dedupeKey: `student-media-published-teacher:${media._id}` }).catch(() => {});
  return mediaPublic(updated);
};

export const archiveMedia = async (req, id, input = {}) => {
  const media = await getMediaForAdminAction(req, id);
  if (media.reviewStatus === "removed") throw new HttpError(409, "Removed media cannot be archived");
  const updated = await adminActionCommon(req, media, {
    reviewStatus: "archived",
    publicationStatus: "archived",
    archivedAt: new Date(),
    reviewNote: safeString(input.note, 1000)
  }, "archived", "student_media.archived", safeString(input.note, 1000));
  return mediaPublic(updated);
};

export const removeMedia = async (req, id, input = {}) => {
  const media = await getMediaForAdminAction(req, id);
  if (media.reviewStatus === "removed") return mediaPublic(media);
  const reason = safeString(input.reason, 1000);
  const bytesToRelease = Number(media.sizeBytes) || 0;
  const updated = await adminActionCommon(req, media, {
    reviewStatus: "removed",
    publicationStatus: "removed",
    removedAt: new Date(),
    removedBy: req.user._id,
    reviewNote: safeString(input.note, 1000),
    rejectionReason: reason || media.rejectionReason
  }, "removed", "student_media.removed", safeString(input.note, 1000), reason);
  await releaseQuotaBytes(req.school._id, bytesToRelease);
  // Keep storage object for audit/retention by default; admin removal removes access.
  return mediaPublic(updated);
};

export const resubmitMedia = async (req, id, input) => {
  const schoolId = assertTenant(req);
  const media = await StudentMedia.findOne({ _id: id, schoolId, isActive: true });
  if (!media) throw new HttpError(404, "Media was not found");
  if (String(media.uploadedBy) !== String(req.user._id) && req.user.role === "teacher") throw new HttpError(403, "You can only resubmit your own media");
  if (req.user.role === "teacher" && !(await canTeacherAccessMedia(schoolId, req.user._id, media))) {
    await logAccess({ schoolId, mediaId: media._id, actorUserId: req.user._id, actorRole: "teacher", action: "resubmit", outcome: "denied", reason: "current_assignment_missing" });
    throw new HttpError(403, "You can only resubmit media for students you are currently assigned to");
  }
  if (!["changes_requested"].includes(media.reviewStatus)) throw new HttpError(409, "Only media with requested changes can be resubmitted");
  const providerName = getDocumentStorageProviderName();
  const storage = getDocumentStorageProvider();
  const capabilities = getStorageCapabilities(storage);
  const buffer = Buffer.from(input.dataBase64, "base64");
  if (!buffer.length) throw new HttpError(400, "The uploaded file is empty");
  validateUpload({ ...media.toObject(), ...input }, buffer, capabilities);
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const oldSizeBytes = Number(media.sizeBytes) || 0;
  await reserveQuotaBytes(schoolId, buffer.length);
  let newQuotaReserved = buffer.length;
  const storageKey = `${schoolId}/student-media/${randomUUID()}-${sanitizeFileName(input.fileName)}`;
  try {
    await storage.upload({ key: storageKey, body: buffer, contentType: input.contentType });
  } catch (error) {
    await releaseQuotaBytes(schoolId, newQuotaReserved);
    throw error;
  }
  const oldKey = media.storageKey;
  const oldProvider = media.storageProvider;
  try {
    await withTransaction(async (session) => {
      media.fileName = safeString(input.fileName, 240);
      media.contentType = input.contentType;
      media.sizeBytes = buffer.length;
      media.durationSeconds = input.durationSeconds ?? media.durationSeconds;
      media.durationVerified = false;
      media.durationSource = "unverified";
      media.metadataVerifiedAt = null;
      media.uploadMode = "base64";
      media.storageProvider = providerName;
      media.storageKey = storageKey;
      media.checksum = checksum;
      media.title = safeString(input.title ?? media.title, 160);
      media.description = safeString(input.description ?? media.description, 2000);
      media.teacherNote = safeString(input.teacherNote ?? media.teacherNote, 2000);
      if (input.eventDate !== undefined) media.eventDate = input.eventDate ? new Date(input.eventDate) : null;
      media.reviewStatus = "pending_review";
      media.publicationStatus = "draft";
      media.rejectionReason = "";
      media.changeRequestReason = "";
      media.reviewNote = "";
      const consent = await evaluateMediaConsent(schoolId, media);
      media.consentStatus = consent.ok ? "verified"
        : (consent.blockedStudentIds.length ? "blocked"
          : (consent.withdrawnStudentIds.length ? "withdrawn" : "pending"));
      recordHistory(media, { action: "resubmitted", actorUserId: req.user._id, actorRole: req.user.role, note: "Media resubmitted after requested changes" });
      await media.save({ session });
      await writeAudit(req, { action: "student_media.resubmitted", resourceId: media._id, metadata: { sizeBytes: buffer.length, previousSizeBytes: oldSizeBytes }, session });
    });
  } catch (error) {
    await storage.delete({ key: storageKey }).catch(() => {});
    await releaseQuotaBytes(schoolId, newQuotaReserved);
    throw error;
  }
  await releaseQuotaOnce({ schoolId, bytes: oldSizeBytes, idempotencyKey: `resubmit-old:${schoolId}:${media._id}:${oldKey}` }).catch(() => {});
  newQuotaReserved = 0;
  try {
    await getDocumentStorageProvider(oldProvider || "s3").delete({ key: oldKey });
  } catch {
    // A provider switch must not turn a committed resubmit into a 500. The
    // cleanup job retries the idempotent object delete out of band.
    await scheduleStorageDeleteOnce({ schoolId, storageKey: oldKey, storageProvider: oldProvider || "s3", sourceKey: `resubmit:${media._id}` });
  }
  await createNotificationsForRoles({ schoolId, roles: ["school_admin", "principal"], type: "media", title: "Student media resubmitted", body: `${media.title} was resubmitted and needs review.`, data: { mediaId: String(media._id), kind: "student_media_resubmitted" }, dedupeKey: `student-media-resubmitted:${media._id}` }).catch(() => {});
  return mediaPublic(media);
};

const DIRECT_TASK_KINDS = new Set(["direct_upload", "direct_resubmit"]);

const advisoryDurationSeconds = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const durationFromProvider = (metadata, advisoryValue) => {
  const providerValue = Number(metadata?.durationSeconds);
  if (Number.isFinite(providerValue) && providerValue > 0) {
    if (providerValue > MEDIA_LIMITS.videoMaxSeconds) {
      const err = new HttpError(400, `Videos must be ${MEDIA_LIMITS.videoMaxSeconds} seconds or shorter`);
      err.code = "STUDENT_MEDIA_PROVIDER_DURATION_TOO_LONG";
      throw err;
    }
    return {
      durationSeconds: Math.round(providerValue * 100) / 100,
      durationVerified: true,
      durationSource: "provider",
      metadataVerifiedAt: new Date()
    };
  }
  // Browser duration is advisory only. It is stored for the reviewer but can
  // never authorise publication of a video.
  return {
    durationSeconds: advisoryDurationSeconds(advisoryValue),
    durationVerified: false,
    durationSource: "unverified",
    metadataVerifiedAt: null
  };
};

const assertDirectMetadata = (input, capabilities) => {
  const type = String(input?.mediaType ?? "");
  const category = String(input?.category ?? "");
  const allowed = allowedTypesFor(type, category);
  if (!allowed.has(String(input.contentType))) {
    throw new HttpError(400, "This file type is not allowed for the selected media category");
  }
  const maxBytes = effectiveMaxBytesFor(type, category, capabilities);
  const byteSize = Number(input.byteSize);
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > maxBytes) {
    throw new HttpError(400, `File exceeds the provider-compatible maximum of ${maxBytes} bytes`);
  }
  if (Number.isFinite(Number(input.durationSeconds)) && Number(input.durationSeconds) > MEDIA_LIMITS.videoMaxSeconds) {
    throw new HttpError(400, `Videos must be ${MEDIA_LIMITS.videoMaxSeconds} seconds or shorter`);
  }
};

const verifyDirectObject = async ({ storage, capabilities, payload, advisoryDuration }) => {
  const metadata = await storage.getObjectMetadata({ key: payload.storageKey });
  if (!metadata) {
    const err = new HttpError(410, "The uploaded object was not found at the storage provider");
    err.code = "STUDENT_MEDIA_UPLOAD_NOT_FOUND";
    throw err;
  }
  const reportedSize = Number(metadata.sizeBytes);
  if (!Number.isSafeInteger(reportedSize) || reportedSize !== Number(payload.byteSize)) {
    const err = new HttpError(400, "The uploaded object size does not match the authorized upload");
    err.code = "STUDENT_MEDIA_OBJECT_SIZE_MISMATCH";
    throw err;
  }
  const bytes = await storage.readObjectBytes({ key: payload.storageKey, maxBytes: payload.byteSize });
  if (!bytes) {
    const err = new HttpError(410, "The uploaded object could not be read for verification");
    err.code = "STUDENT_MEDIA_UPLOAD_NOT_READABLE";
    throw err;
  }
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (checksum !== String(payload.checksumSha256 || "").toLowerCase()) {
    const err = new HttpError(400, "The uploaded object checksum does not match the authorized upload");
    err.code = "STUDENT_MEDIA_OBJECT_CHECKSUM_MISMATCH";
    throw err;
  }
  const duration = durationFromProvider(metadata, advisoryDuration);
  validateUpload({
    mediaType: payload.mediaType,
    category: payload.category,
    contentType: payload.contentType,
    durationSeconds: duration.durationSeconds
  }, bytes, capabilities);
  return { metadata, checksum, duration };
};

const compensateDirectTask = async ({ schoolId, task, error }) => {
  const payload = task.payload || {};
  await markCleanupTask(schoolId, task.idempotencyKey, {
    status: "failed",
    lastErrorCode: safeErrorCode(error),
    "result.failedAt": new Date()
  });
  if (payload.storageKey) {
    await scheduleStorageDeleteOnce({
      schoolId,
      storageKey: payload.storageKey,
      storageProvider: payload.storageProvider,
      sourceKey: payload.uploadId
    });
  }
  const reservedBytes = Number(payload.quotaBytes ?? payload.byteSize);
  if (reservedBytes > 0) {
    await releaseQuotaOnce({
      schoolId,
      bytes: reservedBytes,
      idempotencyKey: payload.uploadId,
      phase: "direct_upload_rollback"
    }).catch(() => {});
  }
  if (payload.dailyReservation) {
    await scheduleDailySlotReleaseOnce({ schoolId, reservation: payload.dailyReservation, sourceKey: payload.uploadId });
  }
};

const completeDirectTask = async (schoolId, task, result) =>
  markCleanupTask(schoolId, task.idempotencyKey, {
    status: "done",
    phase: "done",
    lastErrorCode: "",
    result: { ...(task.result || {}), ...result }
  });

const directPayloadFromInput = (input) => ({
  title: safeString(input.title, 160),
  description: safeString(input.description, 2000),
  teacherNote: safeString(input.teacherNote, 2000),
  mediaType: input.mediaType,
  category: input.category,
  eventDate: input.eventDate ? new Date(input.eventDate) : null,
  fileName: safeString(input.fileName, 240),
  contentType: input.contentType,
  byteSize: Number(input.byteSize),
  checksumSha256: String(input.checksumSha256).toLowerCase(),
  advisoryDurationSeconds: advisoryDurationSeconds(input.durationSeconds)
});

const buildDirectAuthorization = async (storage, key, contentType, ttlSeconds) =>
  storage.createUploadAuthorization({ key, contentType, expiresInSeconds: ttlSeconds });

export const getTeacherUploadCapabilities = async (req) => {
  const schoolId = assertTenant(req);
  if (!["teacher", "school_admin", "principal"].includes(req.user.role)) throw new HttpError(403, "Forbidden");
  const readiness = getDirectUploadReadiness();
  const capabilities = readiness.capabilities;
  return {
    directUploadSupported: readiness.supported,
    provider: {
      configured: isDocumentStorageConfigured(),
      providerName: readiness.providerName || null,
      directUpload: capabilities.directUpload,
      objectLookup: capabilities.objectLookup,
      objectRead: capabilities.objectRead,
      maxUploadBytes: capabilities.maxUploadBytes,
      uploadAuthTtlSeconds: capabilities.uploadAuthTtlSeconds
    },
    effectiveLimits: {
      photo: effectiveMaxBytesFor("photo", "photo", capabilities),
      video: effectiveMaxBytesFor("video", "video", capabilities),
      certificate: effectiveMaxBytesFor("certificate", "certificate", capabilities),
      project: effectiveMaxBytesFor("project", "project", capabilities),
      document: effectiveMaxBytesFor("document", "document", capabilities)
    },
    limits: {
      videoMaxSeconds: MEDIA_LIMITS.videoMaxSeconds,
      teacherDailyUploadLimit: MEDIA_LIMITS.teacherDailyUploadLimit,
      maxAffectedStudents: MEDIA_LIMITS.maxAffectedStudents
    }
  };
};

export const authorizeTeacherDirectUpload = async (req, input) => {
  const schoolId = assertTenant(req);
  if (!["teacher", "school_admin", "principal"].includes(req.user.role)) {
    throw new HttpError(403, "You do not have permission to upload student media");
  }
  const studentIds = [...new Set((input.studentIds || [input.studentId]).filter(Boolean).map(String))];
  if (!studentIds.length) throw new HttpError(400, "At least one student is required");
  if (studentIds.length > MEDIA_LIMITS.maxAffectedStudents) throw new HttpError(400, "Too many affected students selected");
  const primaryStudentId = String(input.studentId || studentIds[0]);
  if (!studentIds.includes(primaryStudentId)) studentIds.unshift(primaryStudentId);
  await assertStudentsInSchool(schoolId, studentIds);
  await assertTeacherCanAccessStudents(req, schoolId, studentIds);

  const readiness = assertDirectUploadReady();
  const capabilities = readiness.capabilities;
  assertDirectMetadata(input, capabilities);
  const payload = directPayloadFromInput(input);

  const recent = await StudentMedia.findOne({
    schoolId,
    uploadedBy: req.user._id,
    primaryStudentId,
    checksum: payload.checksumSha256,
    isActive: true,
    createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
  }).lean();
  if (recent) {
    throw new HttpError(409, "A similar upload was recently submitted. Please check your upload history before trying again.");
  }

  const uploadId = randomUUID();
  const storageKey = `${schoolId}/student-media/${randomUUID()}-${sanitizeFileName(payload.fileName)}`;
  const authorization = await buildDirectAuthorization(
    readiness.storage,
    storageKey,
    payload.contentType,
    capabilities.uploadAuthTtlSeconds
  );
  const expiresAt = authorization.expiresAt || new Date(Date.now() + capabilities.uploadAuthTtlSeconds * 1000).toISOString();

  let dailyReservation = null;
  if (req.user.role === "teacher") {
    const dayKey = getDailyUploadDayKey(new Date(), req.school);
    const dedupeKey = createHash("sha256")
      .update(`teacher-upload:${schoolId}:${req.user._id}:${dayKey}:${payload.checksumSha256}:${primaryStudentId}`)
      .digest("hex")
      .slice(0, 64);
    const reserved = await reserveDailyUploadSlot({
      schoolId,
      teacherId: req.user._id,
      dayKey,
      dedupeKey,
      limit: MEDIA_LIMITS.teacherDailyUploadLimit
    });
    if (reserved.alreadyCommitted || reserved.alreadyReserved) {
      throw new HttpError(409, "A similar upload was recently submitted. Please check your upload history before trying again.");
    }
    dailyReservation = {
      schoolId,
      teacherId: req.user._id,
      dayKey,
      dedupeKey,
      _id: reserved.reservation?._id ? String(reserved.reservation._id) : undefined
    };
    if (dailyReservation._id) {
      await StudentMediaUploadReservation.updateOne(
        { schoolId, _id: reserved.reservation._id },
        {
          $set: {
            directUpload: { uploadId, storageKey, kind: authorization.kind },
            uploadAuthExpiresAt: new Date(expiresAt),
            completionStatus: "none"
          }
        }
      );
    }
  }

  const quota = await reserveQuotaBytesWithCleanup(schoolId, payload.byteSize, {
    idempotencyKey: uploadId,
    kind: "direct_upload",
    phase: "awaiting_upload",
    payload: {
      ...payload,
      uploadId,
      mode: "create",
      studentIds,
      primaryStudentId,
      storageKey,
      storageProvider: readiness.providerName,
      dailyReservation,
      // Canonical UTC string so expired authorizations are queryable by the job.
      expiresAt: new Date(expiresAt).toISOString()
    }
  }).catch(async (error) => {
    if (dailyReservation) await scheduleDailySlotReleaseOnce({ schoolId, reservation: dailyReservation, sourceKey: uploadId });
    throw error;
  });

  return {
    uploadId,
    authorization,
    expiresAt,
    expiresInSeconds: capabilities.uploadAuthTtlSeconds,
    expected: {
      key: storageKey,
      contentType: payload.contentType,
      byteSize: payload.byteSize,
      checksumSha256: payload.checksumSha256
    },
    quota: { reservedBytes: quota.quotaBytes > 0 ? payload.byteSize : 0, appQuotaBytes: quota.quotaBytes }
  };
};

export const finalizeTeacherDirectUpload = async (req, input) => {
  const schoolId = assertTenant(req);
  if (!["teacher", "school_admin", "principal"].includes(req.user.role)) {
    throw new HttpError(403, "You do not have permission to upload student media");
  }
  const task = await getCleanupTask(schoolId, input.uploadId);
  if (!task || task.kind !== "direct_upload" || task.payload?.mode !== "create") {
    throw new HttpError(404, "Upload authorization was not found");
  }
  if (task.status === "done" && task.result?.response) return task.result.response;
  if (task.status === "failed") throw new HttpError(410, "Upload authorization has failed and cannot be finalized");
  const payload = task.payload || {};
  if (new Date(payload.expiresAt).getTime() <= Date.now()) {
    const err = new HttpError(410, "Upload authorization expired. Start a new upload.");
    err.code = "STUDENT_MEDIA_UPLOAD_AUTH_EXPIRED";
    await compensateDirectTask({ schoolId, task, error: err });
    throw err;
  }
  const studentIds = payload.studentIds || [];
  if (req.user.role === "teacher") {
    const allowed = await getTeacherAuthorizedStudentIds(schoolId, req.user._id);
    if (!studentIds.length || !studentIds.every((id) => allowed.includes(String(id)))) {
      await logAccess({ schoolId, mediaId: null, actorUserId: req.user._id, actorRole: "teacher", action: "finalize", outcome: "denied", reason: "current_assignment_missing" });
      throw new HttpError(403, "You are no longer assigned to the students in this upload");
    }
  }

  let verified;
  try {
    const storage = getDocumentStorageProvider(payload.storageProvider || "s3");
    const capabilities = getStorageCapabilities(storage);
    if (!capabilities.objectLookup || !capabilities.objectRead) {
      const err = new HttpError(503, "The configured storage provider cannot verify direct uploads");
      err.code = "STUDENT_MEDIA_OBJECT_VERIFICATION_UNAVAILABLE";
      throw err;
    }
    verified = await verifyDirectObject({
      storage,
      capabilities,
      payload,
      advisoryDuration: input.durationSeconds ?? payload.advisoryDurationSeconds
    });
  } catch (error) {
    await compensateDirectTask({ schoolId, task, error });
    throw error;
  }

  const duplicate = await StudentMedia.findOne({
    schoolId,
    uploadedBy: req.user._id,
    primaryStudentId: payload.primaryStudentId,
    checksum: verified.checksum,
    isActive: true,
    createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
  }).lean();
  if (duplicate) {
    const response = mediaPublic(duplicate);
    await releaseQuotaOnce({ schoolId, bytes: payload.byteSize, idempotencyKey: payload.uploadId, phase: "duplicate" }).catch(() => {});
    if (payload.dailyReservation) await scheduleDailySlotReleaseOnce({ schoolId, reservation: payload.dailyReservation, sourceKey: payload.uploadId });
    await scheduleStorageDeleteOnce({ schoolId, storageKey: payload.storageKey, storageProvider: payload.storageProvider, sourceKey: payload.uploadId });
    await completeDirectTask(schoolId, task, { duplicate: true, response });
    return response;
  }

  try {
    const created = await withTransaction(async (session) => {
      const consent = await evaluateMediaConsent(schoolId, { studentIds, category: payload.category });
      const media = new StudentMedia({
        schoolId,
        studentIds,
        primaryStudentId: payload.primaryStudentId,
        uploadedBy: req.user._id,
        uploadedByRole: req.user.role,
        mediaType: payload.mediaType,
        category: payload.category,
        title: payload.title,
        description: payload.description,
        teacherNote: payload.teacherNote,
        eventDate: payload.eventDate,
        fileName: payload.fileName,
        contentType: payload.contentType,
        sizeBytes: payload.byteSize,
        ...verified.duration,
        storageProvider: payload.storageProvider,
        storageKey: payload.storageKey,
        checksum: verified.checksum,
        uploadMode: "direct",
        reviewStatus: "pending_review",
        publicationStatus: "draft",
        consentStatus: consent.ok ? "verified" : (consent.blockedStudentIds.length ? "blocked" : (consent.withdrawnStudentIds.length ? "withdrawn" : "pending")),
        reviewHistory: [{
          action: "submitted",
          actorUserId: req.user._id,
          actorRole: req.user.role,
          note: "Media submitted for admin review after verified direct upload",
          at: new Date()
        }]
      });
      await media.save({ session });
      await writeAudit(req, {
        action: "student_media.submitted",
        resourceId: media._id,
        metadata: { mediaType: media.mediaType, category: media.category, studentCount: studentIds.length, sizeBytes: media.sizeBytes, uploadMode: "direct" },
        session
      });
      return media;
    });

    if (payload.dailyReservation) {
      await commitDailyUploadSlot({ ...payload.dailyReservation, mediaId: created._id });
      if (payload.dailyReservation._id) {
        await StudentMediaUploadReservation.updateOne(
          { schoolId, _id: payload.dailyReservation._id },
          { $set: { completionStatus: "completed", completedAt: new Date(), mediaId: created._id } }
        );
      }
    }

    await createNotificationsForRoles({
      schoolId,
      roles: ["school_admin", "principal"],
      type: "media",
      title: "New student media awaiting review",
      body: `${safeString(payload.title, 80)} was submitted and is waiting for review.`,
      data: { mediaId: String(created._id), kind: "student_media_submitted" },
      dedupeKey: `student-media-submitted:${created._id}`
    }).catch(() => {});

    const response = mediaPublic(created);
    await completeDirectTask(schoolId, task, { mediaId: String(created._id), response });
    return response;
  } catch (error) {
    await compensateDirectTask({ schoolId, task, error });
    throw error;
  }
};

export const authorizeTeacherDirectResubmit = async (req, id, input) => {
  const schoolId = assertTenant(req);
  const media = await StudentMedia.findOne({ _id: id, schoolId, isActive: true });
  if (!media) throw new HttpError(404, "Media was not found");
  if (req.user.role === "teacher" && String(media.uploadedBy) !== String(req.user._id)) {
    throw new HttpError(403, "You can only resubmit your own media");
  }
  if (req.user.role === "teacher" && !(await canTeacherAccessMedia(schoolId, req.user._id, media))) {
    await logAccess({ schoolId, mediaId: media._id, actorUserId: req.user._id, actorRole: "teacher", action: "resubmit", outcome: "denied", reason: "current_assignment_missing" });
    throw new HttpError(403, "You can only resubmit media for students you are currently assigned to");
  }
  if (media.reviewStatus !== "changes_requested") throw new HttpError(409, "Only media with requested changes can be resubmitted");
  const readiness = assertDirectUploadReady();
  assertDirectMetadata(input, readiness.capabilities);
  const payload = directPayloadFromInput(input);
  const uploadId = randomUUID();
  const storageKey = `${schoolId}/student-media/${randomUUID()}-${sanitizeFileName(payload.fileName)}`;
  const authorization = await buildDirectAuthorization(readiness.storage, storageKey, payload.contentType, readiness.capabilities.uploadAuthTtlSeconds);
  const expiresAt = authorization.expiresAt || new Date(Date.now() + readiness.capabilities.uploadAuthTtlSeconds * 1000).toISOString();
  await reserveQuotaBytesWithCleanup(schoolId, payload.byteSize, {
    idempotencyKey: uploadId,
    kind: "direct_resubmit",
    phase: "awaiting_upload",
    payload: {
      ...payload,
      uploadId,
      mode: "resubmit",
      mediaId: String(media._id),
      storageKey,
      storageProvider: readiness.providerName,
      oldStorageKey: media.storageKey,
      oldStorageProvider: media.storageProvider || "s3",
      oldSizeBytes: Number(media.sizeBytes) || 0,
      expiresAt: new Date(expiresAt).toISOString()
    }
  });

  return {
    uploadId,
    authorization,
    expiresAt,
    expiresInSeconds: readiness.capabilities.uploadAuthTtlSeconds,
    expected: {
      key: storageKey,
      contentType: payload.contentType,
      byteSize: payload.byteSize,
      checksumSha256: payload.checksumSha256
    }
  };
};

export const finalizeTeacherDirectResubmit = async (req, id, input) => {
  const schoolId = assertTenant(req);
  const task = await getCleanupTask(schoolId, input.uploadId);
  if (!task || task.kind !== "direct_resubmit" || task.payload?.mediaId !== String(id)) {
    throw new HttpError(404, "Resubmit authorization was not found");
  }
  if (task.status === "done" && task.result?.response) return task.result.response;
  if (task.status === "failed") throw new HttpError(410, "Resubmit authorization has failed and cannot be finalized");
  const payload = task.payload || {};
  if (new Date(payload.expiresAt).getTime() <= Date.now()) {
    const err = new HttpError(410, "Upload authorization expired. Start a new upload.");
    err.code = "STUDENT_MEDIA_UPLOAD_AUTH_EXPIRED";
    await compensateDirectTask({ schoolId, task, error: err });
    throw err;
  }
  const media = await StudentMedia.findOne({ _id: id, schoolId, isActive: true });
  if (!media) throw new HttpError(404, "Media was not found");
  if (req.user.role === "teacher" && String(media.uploadedBy) !== String(req.user._id)) {
    throw new HttpError(403, "You can only resubmit your own media");
  }
  if (req.user.role === "teacher" && !(await canTeacherAccessMedia(schoolId, req.user._id, media))) {
    await logAccess({ schoolId, mediaId: media._id, actorUserId: req.user._id, actorRole: "teacher", action: "resubmit", outcome: "denied", reason: "current_assignment_missing" });
    throw new HttpError(403, "You are no longer assigned to the students in this upload");
  }
  if (media.reviewStatus !== "changes_requested") throw new HttpError(409, "Only media with requested changes can be resubmitted");

  let verified;
  try {
    const storage = getDocumentStorageProvider(payload.storageProvider || "s3");
    const capabilities = getStorageCapabilities(storage);
    if (!capabilities.objectLookup || !capabilities.objectRead) {
      const err = new HttpError(503, "The configured storage provider cannot verify direct uploads");
      err.code = "STUDENT_MEDIA_OBJECT_VERIFICATION_UNAVAILABLE";
      throw err;
    }
    verified = await verifyDirectObject({ storage, capabilities, payload, advisoryDuration: input.durationSeconds ?? payload.advisoryDurationSeconds });
  } catch (error) {
    await compensateDirectTask({ schoolId, task, error });
    throw error;
  }

  try {
    await withTransaction(async (session) => {
      media.fileName = payload.fileName;
      media.contentType = payload.contentType;
      media.sizeBytes = payload.byteSize;
      media.checksum = verified.checksum;
      media.storageProvider = payload.storageProvider;
      media.storageKey = payload.storageKey;
      media.uploadMode = "direct";
      Object.assign(media, verified.duration);
      media.title = payload.title;
      media.description = payload.description;
      media.teacherNote = payload.teacherNote;
      if (payload.eventDate !== undefined) media.eventDate = payload.eventDate;
      media.reviewStatus = "pending_review";
      media.publicationStatus = "draft";
      media.rejectionReason = "";
      media.changeRequestReason = "";
      media.reviewNote = "";
      const consent = await evaluateMediaConsent(schoolId, media);
      media.consentStatus = consent.ok ? "verified"
        : (consent.blockedStudentIds.length ? "blocked"
          : (consent.withdrawnStudentIds.length ? "withdrawn" : "pending"));
      recordHistory(media, { action: "resubmitted", actorUserId: req.user._id, actorRole: req.user.role, note: "Media resubmitted after requested changes" });
      await media.save({ session });
      await writeAudit(req, { action: "student_media.resubmitted", resourceId: media._id, metadata: { sizeBytes: media.sizeBytes, previousSizeBytes: payload.oldSizeBytes, uploadMode: "direct" }, session });
    });

    await releaseQuotaOnce({
      schoolId,
      bytes: payload.oldSizeBytes,
      idempotencyKey: `resubmit-old:${schoolId}:${media._id}:${payload.oldStorageKey}`
    }).catch(() => {});
    await scheduleStorageDeleteOnce({
      schoolId,
      storageKey: payload.oldStorageKey,
      storageProvider: payload.oldStorageProvider,
      sourceKey: `resubmit:${media._id}`
    });
    await createNotificationsForRoles({
      schoolId,
      roles: ["school_admin", "principal"],
      type: "media",
      title: "Student media resubmitted",
      body: `${media.title} was resubmitted and needs review.`,
      data: { mediaId: String(media._id), kind: "student_media_resubmitted" },
      dedupeKey: `student-media-resubmitted:${media._id}`
    }).catch(() => {});
    const response = mediaPublic(media);
    await completeDirectTask(schoolId, task, { mediaId: String(media._id), response });
    return response;
  } catch (error) {
    await compensateDirectTask({ schoolId, task, error });
    throw error;
  }
};

export const listParentMedia = async (req, input = {}) => {
  const schoolId = assertTenant(req);
  if (req.user.role !== "parent") throw new HttpError(403, "Only parents can access this endpoint");
  const linked = await getLinkedStudentIds(schoolId, req.user._id);
  if (!linked.length) return { items: [], pagination: pageInfo(input.page ?? 1, input.limit ?? 20, 0) };
  const requestedStudentId = input.studentId ? String(input.studentId) : null;
  if (requestedStudentId && !linked.includes(requestedStudentId)) throw new HttpError(404, "Student was not found in this parent's linked records");
  const studentFilter = requestedStudentId ? [requestedStudentId] : linked;
  const filter = {
    schoolId,
    isActive: true,
    publicationStatus: "published",
    reviewStatus: "approved",
    consentStatus: "verified",
    studentIds: { $in: studentFilter }
  };
  if (input.category) filter.category = input.category;
  if (input.mediaType) filter.mediaType = input.mediaType;
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;
  const [items, total] = await Promise.all([
    StudentMedia.find(filter).sort({ publishedAt: -1, createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    StudentMedia.countDocuments(filter)
  ]);
  return { items: items.map((m) => mediaPublic(m)), pagination: pageInfo(page, limit, total) };
};

const assertParentCanAccessPublishedMedia = async (req, media) => {
  const schoolId = assertTenant(req);
  if (req.user.role !== "parent") throw new HttpError(403, "Forbidden");
  if (!media || !media.isActive || media.publicationStatus !== "published" || media.reviewStatus !== "approved" || media.consentStatus !== "verified") {
    throw new HttpError(404, "Media was not found");
  }
  const linked = await getLinkedStudentIds(schoolId, req.user._id);
  const hasAccess = (media.studentIds || []).some((id) => linked.includes(String(id)));
  if (!hasAccess) throw new HttpError(404, "Media was not found");
  // Re-check consent at access time - withdrawal must suspend access.
  const consent = await evaluateMediaConsent(schoolId, media);
  if (!consent.ok) {
    const invalidStatus = consent.blockedStudentIds.length ? "blocked"
      : (consent.withdrawnStudentIds.length ? "withdrawn" : "pending");
    await StudentMedia.updateOne({ schoolId, _id: media._id }, { $set: { consentStatus: invalidStatus, publicationStatus: "unpublished" } });
    await writeAudit(req, { action: "student_media.consent_invalidated", resourceId: media._id, metadata: { reason: "consent_invalidated", consentStatus: invalidStatus, publicationStatus: "unpublished" } });
    await logAccess({ schoolId, mediaId: media._id, actorUserId: req.user._id, actorRole: req.user.role, action: "blocked", outcome: "denied", reason: "consent_invalidated" });
    throw new HttpError(404, "Media is not available");
  }
  return linked;
};

export const getParentMediaDetail = async (req, id) => {
  const schoolId = assertTenant(req);
  const media = await StudentMedia.findOne({ _id: id, schoolId, isActive: true }).lean();
  if (!media) throw new HttpError(404, "Media was not found");
  await assertParentCanAccessPublishedMedia(req, media);
  await logAccess({ schoolId, mediaId: media._id, actorUserId: req.user._id, actorRole: req.user.role, action: "view", outcome: "allowed" });
  return mediaPublic(media);
};

export const getSecureMediaAccess = async (req, id) => {
  const schoolId = assertTenant(req);
  const media = await StudentMedia.findOne({ _id: id, schoolId, isActive: true }).lean();
  if (!media) throw new HttpError(404, "Media was not found");

  if (req.user.role === "parent") {
    await assertParentCanAccessPublishedMedia(req, media);
  } else if (["school_admin", "principal"].includes(req.user.role)) {
    // allowed to review school media; consent/withdrawal checks below still apply
  } else if (req.user.role === "teacher") {
    const allowed = await canTeacherAccessMedia(schoolId, req.user._id, media);
    if (!allowed) {
      await logAccess({
        schoolId,
        mediaId: media._id,
        actorUserId: req.user._id,
        actorRole: "teacher",
        action: "access",
        outcome: "denied",
        reason: "current_assignment_missing"
      });
      throw new HttpError(403, "You do not have access to this media");
    }
  } else {
    throw new HttpError(403, "You do not have access to this media");
  }

  if (media.reviewStatus === "removed" || media.publicationStatus === "removed") throw new HttpError(404, "Media was not found");

  // Consent withdrawal/invalidity must fail closed for new app-level access.
  // Parents are already blocked by assertParentCanAccessPublishedMedia. For admins/teachers,
  // withdrawn/blocked consent blocks new signed URL issuance; missing/pending consent blocks
  // parent/published access and is only allowed for internal review of non-published media.
  const consent = await evaluateMediaConsent(schoolId, media);
  if (!consent.ok) {
    const withdrawnOrBlocked = consent.withdrawnStudentIds.length > 0 || consent.blockedStudentIds.length > 0;
    if (withdrawnOrBlocked || req.user.role === "parent") {
      const invalidStatus = consent.blockedStudentIds.length ? "blocked"
        : (consent.withdrawnStudentIds.length ? "withdrawn" : "blocked");
      const nextPublicationStatus = media.publicationStatus === "published" ? "unpublished" : media.publicationStatus;
      await StudentMedia.updateOne({ schoolId, _id: media._id }, {
        $set: {
          consentStatus: invalidStatus,
          publicationStatus: nextPublicationStatus
        }
      });
      await writeAudit(req, { action: "student_media.consent_invalidated", resourceId: media._id, metadata: { reason: "consent_invalidated", consentStatus: invalidStatus, publicationStatus: nextPublicationStatus } });
      await logAccess({ schoolId, mediaId: media._id, actorUserId: req.user._id, actorRole: req.user.role, action: "blocked", outcome: "denied", reason: "consent_invalidated" });
      throw new HttpError(req.user.role === "parent" ? 404 : 403, "Media access is blocked because required consent is missing, withdrawn, or invalid");
    }
    // Internal review only: missing/pending consent for non-published media. Never issue for published.
    if (media.publicationStatus === "published") {
      await logAccess({ schoolId, mediaId: media._id, actorUserId: req.user._id, actorRole: req.user.role, action: "blocked", outcome: "denied", reason: "consent_missing_published" });
      throw new HttpError(403, "Media access is blocked because required consent is missing or invalid");
    }
    await logAccess({ schoolId, mediaId: media._id, actorUserId: req.user._id, actorRole: req.user.role, action: "preview", outcome: "allowed", reason: "internal_review_consent_pending" });
  }

  const expiresInSeconds = getSignedUrlTtlSeconds();
  const storage = getDocumentStorageProvider(media.storageProvider || "s3");
  const url = await storage.createDownloadUrl({ key: media.storageKey, contentType: media.contentType, expiresIn: expiresInSeconds });
  await logAccess({ schoolId, mediaId: media._id, actorUserId: req.user._id, actorRole: req.user.role, action: "download_url", outcome: "allowed" });
  return { id: String(media._id), url, expiresInSeconds, fileName: media.fileName, contentType: media.contentType };
};

const consentPublic = (c) => ({
  id: String(c._id),
  schoolId: String(c.schoolId),
  studentId: String(c.studentId),
  guardianId: String(c.guardianId),
  guardianUserId: c.guardianUserId ? String(c.guardianUserId) : null,
  recordedByUserId: c.recordedByUserId ? String(c.recordedByUserId) : null,
  recordedByRole: c.recordedByRole || "",
  consentSource: c.consentSource || "guardian_portal",
  verificationEvidence: c.verificationEvidence || "",
  consentingGuardianName: c.consentingGuardianName || "",
  status: c.status,
  scope: c.scope,
  categories: c.categories || [],
  grantedAt: c.grantedAt || null,
  withdrawnAt: c.withdrawnAt || null,
  notes: c.notes || "",
  isActive: c.isActive,
  history: (c.history || []).map((h) => ({ action: h.action, actorUserId: String(h.actorUserId), actorRole: h.actorRole, note: h.note || "", at: h.at })),
  createdAt: c.createdAt,
  updatedAt: c.updatedAt
});

const unpublishMediaForWithdrawnConsent = async (req, schoolId, studentId, categoryScope = null) => {
  const filter = {
    schoolId,
    studentIds: studentId,
    isActive: true,
    reviewStatus: { $nin: ["removed", "archived", "rejected"] },
    publicationStatus: { $in: ["published", "approved_unpublished"] }
  };
  if (categoryScope && categoryScope !== "all") {
    const catMap = { photos: "photo", videos: "video", certificates: "certificate", projects: "project", activities: "educational_activity", events: "school_event", achievements: "achievement" };
    const cat = catMap[categoryScope];
    if (cat) filter.category = cat;
  }
  const affected = await StudentMedia.find(filter);
  for (const media of affected) {
    const consent = await evaluateMediaConsent(schoolId, media);
    if (!consent.ok) {
      const taskKey = await scheduleConsentSuspensionOnce({
        schoolId,
        studentId,
        consentId: req.consentId || "manual",
        scope: categoryScope || "all",
        mediaId: media._id
      });
      try {
        const nextConsentStatus = consent.blockedStudentIds.length ? "blocked"
          : (consent.withdrawnStudentIds.length ? "withdrawn" : "pending");
        const nextPublicationStatus = media.publicationStatus === "published" ? "unpublished" : "approved_unpublished";
        const alreadySuspended = media.consentStatus === nextConsentStatus && media.publicationStatus === nextPublicationStatus;
        media.consentStatus = nextConsentStatus;
        media.publicationStatus = nextPublicationStatus;
        if (!alreadySuspended) {
          recordHistory(media, {
            action: "consent_withdrawn",
            actorUserId: req.user?._id ?? null,
            actorRole: req.user?.role ?? "system",
            note: "Publication suspended because required consent is no longer valid",
            reason: "consent_withdrawn"
          });
        }
        await media.save();
        await writeAudit(req, { action: "student_media.consent_suspended", resourceId: media._id, metadata: { studentId: String(studentId), reason: "consent_withdrawn", consentStatus: media.consentStatus, publicationStatus: media.publicationStatus } });
        await completeConsentSuspensionTask(schoolId, taskKey);
      } catch (error) {
        // Leave the durable task pending so the manual cleanup job can retry
        // this media independently without blocking the rest of the batch.
        await markCleanupTask(schoolId, taskKey, { status: "failed", lastErrorCode: safeErrorCode(error), nextAttemptAt: new Date(Date.now() + 60 * 1000) });
      }
    }
  }
};

export const listStudentMediaConsents = async (req, input = {}) => {
  const schoolId = assertTenant(req);
  const filter = { schoolId, isActive: true };
  if (input.studentId) filter.studentId = input.studentId;
  if (input.guardianId) filter.guardianId = input.guardianId;
  if (input.status) filter.status = input.status;

  if (req.user.role === "parent") {
    const linked = await getLinkedStudentIds(schoolId, req.user._id);
    if (!linked.length) return { items: [], pagination: pageInfo(input.page ?? 1, input.limit ?? 20, 0) };
    if (filter.studentId && !linked.includes(String(filter.studentId))) throw new HttpError(404, "Student was not found");
    if (!filter.studentId) filter.studentId = { $in: linked };
  } else if (!["school_admin", "principal", "teacher"].includes(req.user.role)) {
    throw new HttpError(403, "Forbidden");
  } else if (req.user.role === "teacher" && filter.studentId) {
    await assertTeacherCanAccessStudents(req, schoolId, [String(filter.studentId)]);
  } else if (req.user.role === "teacher") {
    const allowed = await getTeacherAuthorizedStudentIds(schoolId, req.user._id);
    filter.studentId = { $in: allowed };
  }

  const page = input.page ?? 1;
  const limit = input.limit ?? 20;
  const [items, total] = await Promise.all([
    StudentMediaConsent.find(filter).sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    StudentMediaConsent.countDocuments(filter)
  ]);
  return { items: items.map(consentPublic), pagination: pageInfo(page, limit, total) };
};

const notifyConsentWithdrawal = async (req, consent, { reason = "" } = {}) => {
  try {
    const student = await Student.findOne({ _id: consent.studentId, schoolId: consent.schoolId }).select("firstName lastName admissionNumber").lean();
    const studentLabel = student ? `${safeString(student.firstName, 40)} ${safeString(student.lastName, 40)}`.trim() : "a student";
    const scopeLabel = consent.scope === "all" ? "all media categories" : `the ${String(consent.scope).replace(/_/g, " ")} scope`;
    await createNotificationsForRoles({
      schoolId: consent.schoolId,
      roles: ["school_admin", "principal"],
      type: "consent",
      title: "Student media consent withdrawn",
      body: `Media consent for ${studentLabel} (${scopeLabel}) was withdrawn. Published media access has been suspended pending valid consent.`.slice(0, 280),
      data: {
        kind: "student_media_consent_withdrawn",
        consentId: String(consent._id),
        studentId: String(consent.studentId),
        scope: consent.scope
      },
      dedupeKey: `student-media-consent-${consent.status}:${consent._id}:${consent.scope}`
    });
  } catch {
    // Notification failure must not fail a successful consent withdrawal/suspension.
  }
};

export const createStudentMediaConsent = async (req, input) => {
  const schoolId = assertTenant(req);
  if (!["school_admin", "principal"].includes(req.user.role)) throw new HttpError(403, "Only administrators can manage consent records");

  const student = await Student.findOne({ _id: input.studentId, schoolId }).select("_id").lean();
  if (!student) throw new HttpError(404, "Student was not found in this school");
  const guardian = await Guardian.findOne({ _id: input.guardianId, schoolId, isActive: true }).select("_id userId firstName lastName").lean();
  if (!guardian) throw new HttpError(404, "Guardian was not found in this school");
  const link = await StudentGuardian.findOne({ schoolId, studentId: input.studentId, guardianId: input.guardianId }).lean();
  if (!link) throw new HttpError(400, "The selected guardian is not linked to this student");

  const scope = input.scope || "all";
  const categories = Array.isArray(input.categories) ? [...new Set(input.categories.map((c) => safeString(c, 60)))].filter(Boolean) : [];
  const existing = await StudentMediaConsent.findOne({ schoolId, studentId: input.studentId, guardianId: input.guardianId, scope });
  if (existing) throw new HttpError(409, "A consent record for this student, guardian, and scope already exists. Update it instead.");

  const now = new Date();
  const consentSource = input.consentSource || "school_recorded_paper";
  const consent = await StudentMediaConsent.create({
    schoolId,
    studentId: input.studentId,
    guardianId: input.guardianId,
    guardianUserId: guardian.userId || null,
    recordedByUserId: req.user._id,
    recordedByRole: req.user.role,
    consentSource,
    verificationEvidence: safeString(input.verificationEvidence, 2000),
    consentingGuardianName: safeString(input.consentingGuardianName || `${guardian.firstName || ""} ${guardian.lastName || ""}`.trim(), 160),
    status: input.status || "granted",
    scope,
    categories,
    grantedBy: ["withdrawn", "blocked"].includes(input.status) ? null : req.user._id,
    grantedAt: ["withdrawn", "blocked"].includes(input.status) ? null : now,
    withdrawnBy: ["withdrawn", "blocked"].includes(input.status) ? req.user._id : null,
    withdrawnAt: ["withdrawn", "blocked"].includes(input.status) ? now : null,
    notes: safeString(input.notes, 1000),
    history: [{
      action: input.status === "withdrawn" ? "withdrawn" : input.status === "blocked" ? "blocked" : "granted",
      actorUserId: req.user._id,
      actorRole: req.user.role,
      note: safeString(input.notes, 1000),
      at: now
    }]
  });

  await writeAudit(req, { action: "student_media_consent.created", resourceId: consent._id, metadata: { studentId: String(input.studentId), guardianId: String(input.guardianId), status: consent.status, scope, consentSource } });
  if (consent.status === "withdrawn" || consent.status === "blocked") {
    await unpublishMediaForWithdrawnConsent({ ...req, consentId: consent._id }, schoolId, input.studentId, scope);
    await notifyConsentWithdrawal(req, consent, { reason: consent.notes });
  }
  return consentPublic(consent);
};

export const updateStudentMediaConsent = async (req, id, input) => {
  const schoolId = assertTenant(req);
  if (!["school_admin", "principal"].includes(req.user.role)) throw new HttpError(403, "Only administrators can manage consent records");
  const consent = await StudentMediaConsent.findOne({ _id: id, schoolId, isActive: true });
  if (!consent) throw new HttpError(404, "Consent record was not found");

  const previousStatus = consent.status;
  const now = new Date();
  if (input.scope !== undefined) consent.scope = input.scope;
  if (input.categories !== undefined) consent.categories = Array.isArray(input.categories) ? [...new Set(input.categories.map((c) => safeString(c, 60)))].filter(Boolean) : [];
  if (input.notes !== undefined) consent.notes = safeString(input.notes, 1000);
  if (input.consentSource !== undefined) consent.consentSource = input.consentSource;
  if (input.verificationEvidence !== undefined) consent.verificationEvidence = safeString(input.verificationEvidence, 2000);
  if (input.consentingGuardianName !== undefined) consent.consentingGuardianName = safeString(input.consentingGuardianName, 160);
  consent.recordedByUserId = req.user._id;
  consent.recordedByRole = req.user.role;
  if (input.status !== undefined) {
    consent.status = input.status;
    if (input.status === "granted") { consent.grantedBy = req.user._id; consent.grantedAt = now; consent.withdrawnBy = null; consent.withdrawnAt = null; }
    if (input.status === "withdrawn") { consent.withdrawnBy = req.user._id; consent.withdrawnAt = now; }
    if (input.status === "blocked") { consent.withdrawnBy = req.user._id; consent.withdrawnAt = now; }
  }
  const action = input.status === "withdrawn" ? "withdrawn" : input.status === "blocked" ? "blocked" : input.status === "granted" ? "granted" : "updated";
  consent.history = [...(consent.history || []), { action, actorUserId: req.user._id, actorRole: req.user.role, note: safeString(input.notes, 1000), at: now }];
  await consent.save();

  await writeAudit(req, { action: "student_media_consent.updated", resourceId: consent._id, metadata: { studentId: String(consent.studentId), status: consent.status, previousStatus, scope: consent.scope, consentSource: consent.consentSource } });
  if (consent.status === "withdrawn" || consent.status === "blocked") {
    await unpublishMediaForWithdrawnConsent({ ...req, consentId: consent._id }, schoolId, consent.studentId, consent.scope);
  }
  if (["withdrawn", "blocked"].includes(consent.status) && previousStatus !== consent.status) {
    await notifyConsentWithdrawal(req, consent, { reason: consent.notes });
  }
  return consentPublic(consent);
};

export const withdrawStudentMediaConsent = async (req, id, input = {}) => {
  return updateStudentMediaConsent(req, id, { status: "withdrawn", notes: input.notes || input.reason || "Consent withdrawn" });
};

export const getStudentMediaUsageSummary = async (req) => {
  const schoolId = assertTenant(req);
  if (!["school_admin", "principal"].includes(req.user.role)) throw new HttpError(403, "Forbidden");
  const [totals, byType, recentUploads] = await Promise.all([
    StudentMedia.aggregate([
      { $match: { schoolId, isActive: true, reviewStatus: { $ne: "removed" } } },
      { $group: { _id: null, count: { $sum: 1 }, totalBytes: { $sum: "$sizeBytes" } } }
    ]),
    StudentMedia.aggregate([
      { $match: { schoolId, isActive: true, reviewStatus: { $ne: "removed" } } },
      { $group: { _id: "$mediaType", count: { $sum: 1 }, totalBytes: { $sum: "$sizeBytes" } } }
    ]),
    StudentMedia.countDocuments({ schoolId, isActive: true, createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } })
  ]);
  const total = totals[0] || { count: 0, totalBytes: 0 };
  // Configurable app quota: conservative defaults, env-overridable. No provider-reported usage invented.
  const quotaBytes = getAppQuotaBytes();
  const usedBytes = total.totalBytes || 0;
  const ratio = quotaBytes > 0 ? usedBytes / quotaBytes : 0;
  const warningLevel = ratio >= 1 ? 100 : ratio >= 0.95 ? 95 : ratio >= 0.85 ? 85 : ratio >= 0.7 ? 70 : 0;
  return {
    tracked: {
      mediaCount: total.count || 0,
      totalBytes: usedBytes,
      byType: byType.map((t) => ({ mediaType: t._id, count: t.count, totalBytes: t.totalBytes })),
      uploadsLast30Days: recentUploads
    },
    quota: {
      appQuotaBytes: quotaBytes,
      usedBytes,
      remainingBytes: Math.max(0, quotaBytes - usedBytes),
      usageRatio: ratio,
      warningLevel,
      blocked: ratio >= 1
    },
    limits: MEDIA_LIMITS,
    provider: {
      configured: isDocumentStorageConfigured(),
      providerName: (() => { try { return getDocumentStorageProviderName(); } catch { return null; } })(),
      capabilities: getDirectUploadReadiness().capabilities,
      verifiedUsageAvailable: false,
      note: "Provider-reported storage/bandwidth usage is not verified by this app. Values shown are application-tracked estimates."
    }
  };
};

const CLEANUP_JOB_KINDS = ["storage_delete", "quota_release", "daily_slot_release", "consent_suspension"];
// Abandoned direct authorizations are only reconciled after their short-lived
// window closes; an in-flight browser upload must never be cancelled by the job.
const DIRECT_CLEANUP_KINDS = ["direct_upload", "direct_resubmit"];

const claimableCleanupFilter = (now) => ({
  status: { $in: ["pending", "failed"] },
  $and: [
    { $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
    { $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lt: now } }] },
    {
      $or: [
        { kind: { $in: CLEANUP_JOB_KINDS } },
        { kind: { $in: DIRECT_CLEANUP_KINDS }, "payload.expiresAt": { $lte: now.toISOString() } }
      ]
    }
  ]
});

const claimCleanupTaskForJob = async (now) => {
  const leaseExpiresAt = new Date(now.getTime() + CLEANUP_LEASE_MS);
  return StudentMediaCleanupTask.findOneAndUpdate(
    claimableCleanupFilter(now),
    { $set: { status: "running", leaseExpiresAt, "result.claimedAt": now }, $inc: { attempts: 1 } },
    { new: true }
  ).lean();
};

const processCleanupTask = async (task) => {
  const payload = task.payload || {};
  const schoolId = task.schoolId;
  if (DIRECT_CLEANUP_KINDS.includes(task.kind)) {
    // The browser never finalized before the authorization expired. Release
    // every side effect through the same idempotent compensation path used by
    // a failed finalize; the media record is never created here.
    const error = new HttpError(410, "Upload authorization expired before finalization");
    error.code = "STUDENT_MEDIA_UPLOAD_AUTH_EXPIRED";
    await compensateDirectTask({ schoolId, task, error });
    return { compensated: true };
  }
  if (task.kind === "storage_delete") {
    const storage = getDocumentStorageProvider(payload.storageProvider || "s3");
    await storage.delete({ key: payload.storageKey });
    return { deleted: true };
  }
  if (task.kind === "quota_release") {
    const bytes = Number(payload.bytes) || 0;
    if (!bytes) return { skipped: true };
    if (task.result?.releasedAt) return { alreadyReleased: true };
    let releasedByJob = false;
    // The counter change and the durable marker commit together. A crash after
    // commit but before the job marks the task done must not release twice.
    await withTransaction(async (session) => {
      const current = await StudentMediaCleanupTask.findOne({ schoolId, idempotencyKey: task.idempotencyKey }).session(session).lean();
      if (current?.result?.releasedAt) return;
      await StudentMediaQuota.updateOne(
        { schoolId },
        [{ $set: { usedBytes: { $max: [0, { $subtract: ["$usedBytes", bytes] }] } } }],
        { session }
      );
      await StudentMediaCleanupTask.updateOne(
        { schoolId, idempotencyKey: task.idempotencyKey },
        { $set: { "result.releasedAt": new Date(), "result.bytes": bytes } },
        { session }
      );
      releasedByJob = true;
    });
    return releasedByJob ? { releasedBytes: bytes } : { alreadyReleased: true };
  }
  if (task.kind === "daily_slot_release") {
    const reservation = payload || {};
    if (task.result?.releasedAt) return { alreadyReleased: true };
    let released = null;
    await withTransaction(async (session) => {
      const current = await StudentMediaCleanupTask.findOne({ schoolId, idempotencyKey: task.idempotencyKey }).session(session).lean();
      if (current?.result?.releasedAt) return;
      released = await StudentMediaUploadReservation.findOneAndUpdate(
        { _id: reservation._id || reservation.reservationId, status: "reserved" },
        { $set: { status: "released", releasedAt: new Date(), releaseReason: "cleanup_job" } },
        { new: true, session }
      ).lean();
      // Only a reservation this call actually flipped may decrement the bucket.
      if (released && released.bucketClaimed !== false) {
        await StudentMediaDailyUploadBucket.updateOne(
          { schoolId, teacherId: reservation.teacherId, dayKey: reservation.dayKey, count: { $gt: 0 } },
          { $inc: { count: -1 } },
          { session }
        );
      }
      await StudentMediaCleanupTask.updateOne(
        { schoolId, idempotencyKey: task.idempotencyKey },
        { $set: { "result.releasedAt": new Date(), "result.released": Boolean(released) } },
        { session }
      );
    });
    return released ? { released: true } : { alreadyReleased: true };
  }
  if (task.kind === "consent_suspension") {
    await unpublishMediaForWithdrawnConsent(
      { user: null, role: "system", consentId: payload.consentId },
      schoolId,
      payload.studentId,
      payload.scope
    );
    return { suspended: true };
  }
  return { skipped: true };
};

// Manual-only reconciliation. It is invoked explicitly through the secured
// jobs endpoint; no scheduler should target this job automatically. Every task
// has a stable idempotency key so a retry after a crash cannot release quota
// or a daily slot twice.
export const runStudentMediaCleanup = async ({ limit = 100, now = new Date() } = {}) => {
  const summary = { claimed: 0, done: 0, retried: 0, failed: 0, remaining: 0 };
  const maxTasks = Math.max(1, Math.min(1000, Number(limit) || 100));
  for (let index = 0; index < maxTasks; index += 1) {
    const task = await claimCleanupTaskForJob(now);
    if (!task) break;
    summary.claimed += 1;
    try {
      const result = await processCleanupTask(task);
      await markCleanupTask(task.schoolId, task.idempotencyKey, {
        status: "done",
        phase: "done",
        leaseExpiresAt: null,
        lastErrorCode: "",
        result: { ...(task.result || {}), ...result, completedAt: new Date() }
      });
      summary.done += 1;
    } catch (error) {
      const attempts = Number(task.attempts) || 1;
      const exhausted = attempts >= MAX_CLEANUP_ATTEMPTS;
      const delayMs = Math.min(60 * 60 * 1000, 60 * 1000 * (2 ** Math.min(attempts - 1, 6)));
      await markCleanupTask(task.schoolId, task.idempotencyKey, {
        status: exhausted ? "failed" : "failed",
        phase: "retry",
        leaseExpiresAt: null,
        lastErrorCode: safeErrorCode(error),
        nextAttemptAt: new Date(now.getTime() + delayMs)
      });
      if (exhausted) summary.failed += 1;
      else summary.retried += 1;
    }
  }
  summary.remaining = await StudentMediaCleanupTask.countDocuments(claimableCleanupFilter(now));
  return summary;
};
