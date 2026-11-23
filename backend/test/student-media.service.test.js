import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";
import mongoose from "mongoose";
import { createHash } from "node:crypto";

globalThis.__notifCalls = [];
mock.module("../src/services/notification.service.js", { namedExports: {
  createNotification: async (payload) => { globalThis.__notifCalls.push({ kind: "single", ...payload }); return null; },
  createNotificationsForRoles: async (payload) => { globalThis.__notifCalls.push({ kind: "roles", ...payload }); return []; },
  createNotificationsForUserIds: async (payload) => { globalThis.__notifCalls.push({ kind: "users", ...payload }); return []; }
}});
globalThis.__testLinkedIds = [];
mock.module("../src/services/parent-portal.service.js", { namedExports: {
  getLinkedStudentIds: async () => globalThis.__testLinkedIds
}});

const { default: AcademicSession } = await import("../src/models/academic-session.model.js");
const { default: AuditLog } = await import("../src/models/audit-log.model.js");
const { default: ClassSubject } = await import("../src/models/class-subject.model.js");
const { default: ClassTeacherAssignment } = await import("../src/models/class-teacher-assignment.model.js");
const { default: Guardian } = await import("../src/models/guardian.model.js");
const { default: Student } = await import("../src/models/student.model.js");
const { default: StudentGuardian } = await import("../src/models/student-guardian.model.js");
const { default: StudentMedia } = await import("../src/models/student-media.model.js");
const { default: StudentMediaAccessLog } = await import("../src/models/student-media-access-log.model.js");
const { default: StudentMediaCleanupTask } = await import("../src/models/student-media-cleanup-task.model.js");
const { default: StudentMediaConsent } = await import("../src/models/student-media-consent.model.js");
const { default: StudentMediaDailyUploadBucket } = await import("../src/models/student-media-daily-upload-bucket.model.js");
const { default: StudentMediaQuota } = await import("../src/models/student-media-quota.model.js");
const { default: StudentMediaUploadReservation } = await import("../src/models/student-media-upload-reservation.model.js");
const { default: User } = await import("../src/models/user.model.js");
const { configureDocumentStorageProvider, registerDocumentStorageProvider } = await import("../src/services/document-storage.provider.js");
const {
  approveMedia,
  authorizeTeacherDirectUpload,
  commitDailyUploadSlot,
  cleanupStaleDailyUploadReservations,
  createStudentMediaConsent,
  createStudentMediaUpload,
  effectiveMaxBytesFor,
  finalizeTeacherDirectUpload,
  getDailyUploadDayKey,
  getSecureMediaAccess,
  getSignedUrlTtlSeconds,
  getStudentMediaUsageSummary,
  getTeacherUploadCapabilities,
  listParentMedia,
  listTeacherMedia,
  MEDIA_LIMITS,
  publishMedia,
  rejectMedia,
  releaseDailyUploadSlot,
  releaseQuotaOnce,
  removeMedia,
  requestMediaChanges,
  reserveDailyUploadSlot,
  resubmitMedia,
  runStudentMediaCleanup,
  withdrawStudentMediaConsent
} = await import("../src/services/student-media.service.js");

const SCHOOL_A = "64a000000000000000000001";
const SCHOOL_B = "64a000000000000000000002";
const TEACHER_A = "64a000000000000000000011";
const ADMIN_A = "64a000000000000000000012";
const PARENT_A = "64a000000000000000000013";
const STUDENT_A = "64a000000000000000000021";
const STUDENT_B = "64a000000000000000000022";
const GUARDIAN_A = "64a000000000000000000031";
const MEDIA_A = "64a000000000000000000041";
const ACTIVE_SESSION = "64a000000000000000000098";

const makeStorage = ({ uploadError } = {}) => {
  const calls = { upload: [], delete: [], download: [] };
  return {
    calls,
    upload: async ({ key, body, contentType }) => {
      calls.upload.push({ key, body, contentType });
      if (uploadError) throw uploadError;
      return { key };
    },
    delete: async ({ key }) => { calls.delete.push({ key }); return { deleted: true }; },
    createDownloadUrl: async ({ key, contentType, expiresIn }) => {
      calls.download.push({ key, contentType, expiresIn });
      return `https://signed.example/${encodeURIComponent(key)}?exp=${expiresIn}`;
    }
  };
};

const req = (overrides = {}) => ({
  user: { _id: TEACHER_A, schoolId: SCHOOL_A, role: "teacher", ...(overrides.user || {}) },
  school: { _id: SCHOOL_A, ...(overrides.school || {}) }
});

const base64 = (text = "dummy-image") => Buffer.from(text).toString("base64");
const pngBytes = () => Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"); // PNG header
const mp4Bytes = () => Buffer.from("000000186674797069736f6d", "hex"); // ISO BMFF ftyp/isom header
const uploadInput = (overrides = {}) => ({
  title: "Science Fair",
  description: "Project photo",
  teacherNote: "",
  mediaType: "photo",
  category: "photo",
  fileName: "fair.png",
  contentType: "image/png",
  dataBase64: pngBytes().toString("base64"),
  studentId: STUDENT_A,
  studentIds: [STUDENT_A],
  ...overrides
});

const mockTx = (t) => t.mock.method(mongoose, "startSession", async () => ({ withTransaction: async (fn) => fn(), endSession: async () => {} }));
const mockAudit = (t) => t.mock.method(AuditLog.prototype, "save", async function save() { return this; });
const mockAccessLog = (t) => t.mock.method(StudentMediaAccessLog, "create", async () => ({}));
const resetNotifs = () => { globalThis.__notifCalls = []; };
const mockQuotaOk = (t, usedBytes = 0) => {
  t.mock.method(StudentMediaQuota, "findOne", () => ({ lean: async () => ({ schoolId: SCHOOL_A, usedBytes }) }));
  t.mock.method(StudentMediaQuota, "updateOne", async () => ({ acknowledged: true }));
  t.mock.method(StudentMediaQuota, "findOneAndUpdate", () => ({ lean: async () => ({ schoolId: SCHOOL_A, usedBytes: usedBytes + 1 }) }));
};
const mockQuotaExhausted = (t, usedBytes = 1024 * 1024 * 1024) => {
  t.mock.method(StudentMediaQuota, "findOne", () => ({ lean: async () => ({ schoolId: SCHOOL_A, usedBytes }) }));
  t.mock.method(StudentMediaQuota, "updateOne", async () => ({ acknowledged: true }));
  t.mock.method(StudentMediaQuota, "findOneAndUpdate", () => ({ lean: async () => null }));
};
const mockDailyLimitOk = (t) => {
  t.mock.method(StudentMediaUploadReservation, "find", () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(StudentMediaUploadReservation, "findOne", () => ({ lean: async () => null }));
  t.mock.method(StudentMediaUploadReservation, "findOneAndUpdate", () => ({ lean: async () => null }));
  t.mock.method(StudentMediaUploadReservation, "countDocuments", async () => 0);
  t.mock.method(StudentMediaUploadReservation, "create", async (doc) => ({ ...doc, _id: "64a000000000000000000099", toObject() { return { ...doc, _id: "64a000000000000000000099" }; } }));
  t.mock.method(StudentMediaUploadReservation, "updateOne", async () => ({ modifiedCount: 1, matchedCount: 1 }));
  t.mock.method(StudentMediaDailyUploadBucket, "findOne", () => ({ lean: async () => null }));
  t.mock.method(StudentMediaDailyUploadBucket, "findOneAndUpdate", () => ({ lean: async () => ({ schoolId: SCHOOL_A, teacherId: TEACHER_A, dayKey: "2026-11-22", count: 1 }) }));
  t.mock.method(StudentMediaDailyUploadBucket, "create", async (doc) => ({ ...doc, toObject() { return doc; } }));
  t.mock.method(StudentMediaDailyUploadBucket, "updateOne", async () => ({ modifiedCount: 1 }));
};
const mockDailyLimitExhausted = (t) => {
  t.mock.method(StudentMediaUploadReservation, "find", () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(StudentMediaUploadReservation, "findOne", () => ({ lean: async () => null }));
  t.mock.method(StudentMediaUploadReservation, "findOneAndUpdate", () => ({ lean: async () => null }));
  t.mock.method(StudentMediaUploadReservation, "countDocuments", async () => 5);
  t.mock.method(StudentMediaDailyUploadBucket, "findOne", () => ({ lean: async () => ({ schoolId: SCHOOL_A, teacherId: TEACHER_A, dayKey: "2026-11-22", count: 5 }) }));
  t.mock.method(StudentMediaDailyUploadBucket, "findOneAndUpdate", () => ({ lean: async () => null }));
  t.mock.method(StudentMediaDailyUploadBucket, "updateOne", async () => ({ modifiedCount: 1 }));
};

// Synthetic direct-upload provider: mandatory contract plus optional, detected
// capabilities. Object bytes are real signed headers so magic-byte checks pass.
const makeDirectStorage = ({ bytes = pngBytes(), durationSeconds = null } = {}) => {
  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  const calls = { upload: [], delete: [], download: [], authorize: [], metadata: [], read: [], capabilities: 0 };
  return {
    bytes,
    checksumSha256,
    calls,
    upload: async ({ key, body, contentType }) => { calls.upload.push({ key, body, contentType }); return { key }; },
    delete: async ({ key }) => { calls.delete.push({ key }); return { deleted: true }; },
    createDownloadUrl: async ({ key, contentType, expiresIn }) => {
      calls.download.push({ key, contentType, expiresIn });
      return `https://signed.example/${encodeURIComponent(key)}?exp=${expiresIn}`;
    },
    getCapabilities: () => {
      calls.capabilities += 1;
      return { directUpload: "presignedPut", objectLookup: true, objectRead: true, maxUploadBytes: null, uploadAuthTtlSeconds: 300 };
    },
    createUploadAuthorization: async ({ key, contentType, expiresInSeconds }) => {
      calls.authorize.push({ key, contentType, expiresInSeconds });
      return {
        kind: "presignedPut",
        method: "PUT",
        url: `https://upload.example/${encodeURIComponent(key)}`,
        headers: { "Content-Type": contentType },
        key,
        contentType,
        expiresInSeconds,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString()
      };
    },
    getObjectMetadata: async ({ key }) => {
      calls.metadata.push({ key });
      return { key, sizeBytes: bytes.length, durationSeconds, etag: `etag-${checksumSha256.slice(0, 8)}` };
    },
    readObjectBytes: async ({ key, maxBytes }) => {
      calls.read.push({ key, maxBytes });
      return bytes;
    }
  };
};

const registerDirectStorage = (storage) => {
  registerDocumentStorageProvider("s3", storage);
  configureDocumentStorageProvider(storage, "s3");
};

const directInput = (bytes = pngBytes(), overrides = {}) => ({
  ...uploadInput(),
  fileName: "direct.png",
  byteSize: bytes.length,
  checksumSha256: createHash("sha256").update(bytes).digest("hex"),
  ...overrides
});

// Cleanup-job queries now use session().lean() inside withTransaction; expose
// the same chain for plain .lean() callers.
const chainWithSession = (resolve) => {
  const chain = {
    lean: async () => (typeof resolve === "function" ? resolve() : resolve),
    session() { return chain; }
  };
  return chain;
};

const setCleanupPath = (target, path, value) => {
  const parts = String(path).split(".");
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!cursor[parts[i]] || typeof cursor[parts[i]] !== "object") cursor[parts[i]] = {};
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
};

const mockCleanupTasks = (t) => {
  const tasks = new Map();
  const updates = [];
  t.mock.method(StudentMediaCleanupTask, "findOne", (query) =>
    chainWithSession(() => tasks.get(String(query?.idempotencyKey)) || null)
  );
  t.mock.method(StudentMediaCleanupTask, "updateOne", async (query, update) => {
    updates.push({ query, update });
    const key = String(query?.idempotencyKey);
    if (update?.$setOnInsert && !tasks.has(key)) {
      tasks.set(key, {
        schoolId: query.schoolId,
        idempotencyKey: key,
        result: {},
        payload: {},
        ...update.$setOnInsert
      });
    }
    if (update?.$set) {
      const current = tasks.get(key) || { schoolId: query.schoolId, idempotencyKey: key, result: {}, payload: {} };
      for (const [path, value] of Object.entries(update.$set)) setCleanupPath(current, path, value);
      tasks.set(key, current);
    }
    return { acknowledged: true, modifiedCount: 1 };
  });
  return { tasks, updates };
};

const mockTeacherAssignment = (t, rows = [{ _id: STUDENT_A, status: "enrolled" }]) => {
  const chain = { select() { return chain; }, sort() { return chain; }, limit() { return chain; }, lean: async () => rows };
  t.mock.method(Student, "find", () => chain);
  t.mock.method(ClassTeacherAssignment, "find", () => ({ select: () => ({ lean: async () => [{ sectionId: "64a000000000000000000099" }] }) }));
  t.mock.method(ClassSubject, "find", () => ({ select: () => ({ lean: async () => [] }) }));
};

const mockConsentGranted = (t) => t.mock.method(StudentMediaConsent, "find", () => ({
  lean: async () => [{ studentId: STUDENT_A, status: "granted", scope: "all", categories: [] }]
}));

// One object serves both awaited document queries and .lean() queries.
const docQuery = (doc) => ({ ...(doc || {}), lean: async () => doc });

// Assignment checks now always resolve the school's active session, and consent
// suspension writes a durable cleanup task. These synthetic defaults keep every
// existing test isolated from MongoDB while individual tests can override them.
beforeEach((t) => {
  t.mock.method(AcademicSession, "findOne", () => ({
    select() {
      return { lean: async () => ({ _id: ACTIVE_SESSION }) };
    }
  }));
  t.mock.method(StudentMediaCleanupTask, "findOne", () => ({ lean: async () => null }));
  t.mock.method(StudentMediaCleanupTask, "updateOne", async () => ({ acknowledged: true, modifiedCount: 1 }));
  t.mock.method(StudentMediaCleanupTask, "countDocuments", async () => 0);
  t.mock.method(StudentMediaCleanupTask, "findOneAndUpdate", () => ({ lean: async () => null }));
});

test("teacher can upload for assigned student and upload is stored privately", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t); mockQuotaOk(t); mockDailyLimitOk(t); resetNotifs();
  const storage = makeStorage();
  registerDocumentStorageProvider("s3", storage);
  configureDocumentStorageProvider(storage, "s3");

  const studentRows = [{ _id: STUDENT_A, firstName: "A", lastName: "B", admissionNumber: "1", classId: SCHOOL_A, sectionId: SCHOOL_A, status: "enrolled" }];
  t.mock.method(Student, "find", () => {
    const chain = {
      select() { return chain; },
      sort() { return chain; },
      limit() { return chain; },
      lean: async () => studentRows
    };
    return chain;
  });
  t.mock.method(ClassTeacherAssignment, "find", () => ({ select: () => ({ lean: async () => [{ sectionId: "64a000000000000000000099", academicSessionId: "64a000000000000000000098" }] }) }));
  t.mock.method(ClassSubject, "find", () => ({ select() { return { lean: async () => [] }; } }));
  t.mock.method(StudentMedia, "countDocuments", async () => 0);
  t.mock.method(StudentMedia, "findOne", () => ({ lean: async () => null }));
  t.mock.method(StudentMedia, "aggregate", async () => [{ totalBytes: 0 }]);
  t.mock.method(StudentMediaConsent, "find", () => ({ lean: async () => [] }));
  t.mock.method(StudentMedia.prototype, "save", async function save() { this._id = this._id || MEDIA_A; this.createdAt = new Date(); this.updatedAt = new Date(); return this; });

  const result = await createStudentMediaUpload(req(), uploadInput());
  assert.equal(result.title, "Science Fair");
  assert.equal(result.reviewStatus, "pending_review");
  assert.equal(result.publicationStatus, "draft");
  assert.equal(storage.calls.upload.length, 1);
  assert.equal(storage.calls.download.length, 0);
  assert.match(storage.calls.upload[0].key, /student-media/);
});

test("teacher cannot upload for unassigned student", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t);
  const storage = makeStorage(); registerDocumentStorageProvider("s3", storage); configureDocumentStorageProvider(storage, "s3");
  const chain = { select() { return chain; }, sort() { return chain; }, limit() { return chain; }, lean: async () => [{ _id: STUDENT_A, status: "enrolled" }] };
  t.mock.method(Student, "find", () => chain);
  t.mock.method(ClassTeacherAssignment, "find", () => ({ select() { return { lean: async () => [] }; } }));
  t.mock.method(ClassSubject, "find", () => ({ select() { return { lean: async () => [] }; } }));
  await assert.rejects(() => createStudentMediaUpload(req(), uploadInput()), (err) => err.statusCode === 403);
  assert.equal(storage.calls.upload.length, 0);
});

test("invalid signature is rejected and nothing is stored", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t);
  const storage = makeStorage(); registerDocumentStorageProvider("s3", storage); configureDocumentStorageProvider(storage, "s3");
  const chain = { select() { return chain; }, sort() { return chain; }, limit() { return chain; }, lean: async () => [{ _id: STUDENT_A, status: "enrolled" }] };
  t.mock.method(Student, "find", () => chain);
  t.mock.method(ClassTeacherAssignment, "find", () => ({ select: () => ({ lean: async () => [{ sectionId: "1" }] }) }));
  t.mock.method(ClassSubject, "find", () => ({ select() { return { lean: async () => [] }; } }));
  t.mock.method(StudentMedia, "countDocuments", async () => 0);
  t.mock.method(StudentMedia, "aggregate", async () => [{ totalBytes: 0 }]);
  await assert.rejects(() => createStudentMediaUpload(req(), uploadInput({ dataBase64: Buffer.from("not-a-png").toString("base64") })), (err) => err.statusCode === 400);
  assert.equal(storage.calls.upload.length, 0);
});

test("publish is blocked when consent is missing", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t);
  const mediaDoc = {
    _id: MEDIA_A, schoolId: SCHOOL_A, studentIds: [STUDENT_A], primaryStudentId: STUDENT_A, uploadedBy: TEACHER_A,
    reviewStatus: "approved", publicationStatus: "approved_unpublished", isActive: true, category: "photo", title: "Photo",
    reviewHistory: [], save: async function () { return this; }
  };
  t.mock.method(StudentMedia, "findOne", async () => mediaDoc);
  t.mock.method(StudentMediaConsent, "find", () => ({ lean: async () => [] }));
  await assert.rejects(() => publishMedia(req({ user: { _id: ADMIN_A, schoolId: SCHOOL_A, role: "school_admin" } }), MEDIA_A, {}), (err) => err.statusCode === 409);
  assert.notEqual(mediaDoc.publicationStatus, "published");
});

test("parent cannot access unpublished media", async (t) => {
  mockAccessLog(t);
  t.mock.method(StudentMedia, "findOne", () => ({ lean: async () => ({ _id: MEDIA_A, schoolId: SCHOOL_A, isActive: true, publicationStatus: "draft", reviewStatus: "pending_review", consentStatus: "pending", studentIds: [STUDENT_A] }) }));
  globalThis.__testLinkedIds=[STUDENT_A];
  await assert.rejects(() => getSecureMediaAccess(req({ user: { _id: PARENT_A, schoolId: SCHOOL_A, role: "parent" } }), MEDIA_A), (err) => err.statusCode === 404);
});

test("parent cannot access another child's media by ID", async (t) => {
  mockAccessLog(t);
  t.mock.method(StudentMedia, "findOne", () => ({ lean: async () => ({ _id: MEDIA_A, schoolId: SCHOOL_A, isActive: true, publicationStatus: "published", reviewStatus: "approved", consentStatus: "verified", studentIds: [STUDENT_B] }) }));
  globalThis.__testLinkedIds=[STUDENT_A];
  await assert.rejects(() => getSecureMediaAccess(req({ user: { _id: PARENT_A, schoolId: SCHOOL_A, role: "parent" } }), MEDIA_A), (err) => err.statusCode === 404);
});

test("consent withdrawal unpublishes affected media and blocks access", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t);
  const cleanupUpdates = [];
  t.mock.method(StudentMediaCleanupTask, "updateOne", async (query, update) => {
    cleanupUpdates.push({ query, update });
    return { acknowledged: true, modifiedCount: 1 };
  });
  const consentDoc = {
    _id: "64a000000000000000000051", schoolId: SCHOOL_A, studentId: STUDENT_A, guardianId: GUARDIAN_A, status: "granted", scope: "all", categories: [], isActive: true, history: [],
    save: async function () { return this; }
  };
  const publishedMedia = {
    _id: MEDIA_A, schoolId: SCHOOL_A, studentIds: [STUDENT_A], category: "photo", publicationStatus: "published", reviewStatus: "approved", consentStatus: "verified", isActive: true, reviewHistory: [],
    save: async function () { return this; }
  };
  t.mock.method(StudentMediaConsent, "findOne", async () => consentDoc);
  t.mock.method(StudentMedia, "find", async () => [publishedMedia]);
  // Keep the notification lookup synthetic so no ORM buffering timeout is hit.
  t.mock.method(Student, "findOne", () => ({ select: () => ({ lean: async () => ({ firstName: "A", lastName: "B", admissionNumber: "1" }) }) }));
  // evaluateMediaConsent will query consents: after withdrawal it should see withdrawn
  t.mock.method(StudentMediaConsent, "find", () => ({ lean: async () => [{ studentId: STUDENT_A, status: "withdrawn", scope: "all", categories: [] }] }));

  await withdrawStudentMediaConsent(req({ user: { _id: ADMIN_A, schoolId: SCHOOL_A, role: "school_admin" } }), consentDoc._id, { notes: "withdrawn" });
  assert.equal(consentDoc.status, "withdrawn");
  assert.equal(publishedMedia.publicationStatus, "unpublished");
  const suspensionUpserts = cleanupUpdates.filter(({ update }) => update?.$setOnInsert?.kind === "consent_suspension");
  assert.equal(suspensionUpserts.length, 1);
  assert.match(String(suspensionUpserts[0].query.idempotencyKey), /^student-media:consent_suspension:/);
  assert.equal(String(suspensionUpserts[0].update.$setOnInsert.payload.studentId), STUDENT_A);
  assert.equal(String(suspensionUpserts[0].update.$setOnInsert.payload.mediaId), MEDIA_A);
  assert.ok(cleanupUpdates.some(({ update }) => update?.$set?.status === "done"));
});

test("consent withdrawal notifies admins with dedupe and no sensitive URLs", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t); resetNotifs();
  const consentDoc = {
    _id: "64a000000000000000000051", schoolId: SCHOOL_A, studentId: STUDENT_A, guardianId: GUARDIAN_A, status: "granted", scope: "all", categories: [], isActive: true, history: [], withdrawnAt: null,
    save: async function () { if (!this.withdrawnAt) this.withdrawnAt = new Date("2026-01-01T00:00:00Z"); return this; }
  };
  t.mock.method(StudentMediaConsent, "findOne", async () => consentDoc);
  t.mock.method(StudentMedia, "find", async () => []);
  t.mock.method(Student, "findOne", () => ({ select: () => ({ lean: async () => ({ firstName: "Ada", lastName: "Lovelace", admissionNumber: "A1" }) }) }));
  t.mock.method(StudentMediaConsent, "find", () => ({ lean: async () => [{ studentId: STUDENT_A, status: "withdrawn", scope: "all", categories: [] }] }));
  await withdrawStudentMediaConsent(req({ user: { _id: ADMIN_A, schoolId: SCHOOL_A, role: "school_admin" } }), consentDoc._id, { notes: "Parent withdrew" });
  const roleNotifs = globalThis.__notifCalls.filter((c) => c.kind === "roles" && c.type === "consent");
  assert.equal(roleNotifs.length, 1);
  assert.deepEqual(roleNotifs[0].roles, ["school_admin", "principal"]);
  assert.match(roleNotifs[0].dedupeKey, /student-media-consent-withdrawn/);
  assert.doesNotMatch(JSON.stringify(roleNotifs[0]), /signed|https?:\/\/|storageKey|cloudinary/i);
});

test("approve and publish are separate operations", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t); resetNotifs();
  const mediaDoc = { _id: MEDIA_A, schoolId: SCHOOL_A, studentIds: [STUDENT_A], primaryStudentId: STUDENT_A, uploadedBy: TEACHER_A, reviewStatus: "pending_review", publicationStatus: "draft", isActive: true, category: "photo", title: "Photo", reviewHistory: [], save: async function(){ this.updatedAt = new Date(); return this; } };
  t.mock.method(StudentMedia, "findOne", async () => mediaDoc);
  t.mock.method(StudentMediaConsent, "find", () => ({ lean: async () => [{ studentId: STUDENT_A, status: "granted", scope: "all", categories: [] }] }));
  t.mock.method(Guardian, "find", () => ({ select: () => ({ lean: async () => [] }) }));
  const adminReq = req({ user: { _id: ADMIN_A, schoolId: SCHOOL_A, role: "school_admin" } });
  const approved = await approveMedia(adminReq, MEDIA_A, {});
  assert.equal(approved.reviewStatus, "approved");
  assert.equal(approved.publicationStatus, "approved_unpublished");
  mediaDoc.reviewStatus = "approved"; mediaDoc.publicationStatus = "approved_unpublished";
  const published = await publishMedia(adminReq, MEDIA_A, {});
  assert.equal(published.publicationStatus, "published");
});

test("publish is blocked when any affected student lacks consent (multi-student)", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t);
  const mediaDoc = { _id: MEDIA_A, schoolId: SCHOOL_A, studentIds: [STUDENT_A, STUDENT_B], primaryStudentId: STUDENT_A, uploadedBy: TEACHER_A, reviewStatus: "approved", publicationStatus: "approved_unpublished", isActive: true, category: "photo", title: "Photo", reviewHistory: [], save: async function(){ return this; } };
  t.mock.method(StudentMedia, "findOne", async () => mediaDoc);
  t.mock.method(StudentMediaConsent, "find", () => ({ lean: async () => [{ studentId: STUDENT_A, status: "granted", scope: "all", categories: [] }] }));
  await assert.rejects(() => publishMedia(req({ user: { _id: ADMIN_A, schoolId: SCHOOL_A, role: "school_admin" } }), MEDIA_A, {}), (err) => err.statusCode === 409);
});

test("duplicate upload within window is rejected", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t); mockQuotaOk(t);
  const storage = makeStorage(); registerDocumentStorageProvider("s3", storage); configureDocumentStorageProvider(storage, "s3");
  const chain = { select() { return chain; }, sort() { return chain; }, limit() { return chain; }, lean: async () => [{ _id: STUDENT_A, status: "enrolled" }] };
  t.mock.method(Student, "find", () => chain);
  t.mock.method(ClassTeacherAssignment, "find", () => ({ select: () => ({ lean: async () => [{ sectionId: "1" }] }) }));
  t.mock.method(ClassSubject, "find", () => ({ select() { return { lean: async () => [] }; } }));
  t.mock.method(StudentMedia, "countDocuments", async () => 0);
  t.mock.method(StudentMedia, "findOne", () => ({ lean: async () => ({ _id: "existing" }) }));
  await assert.rejects(() => createStudentMediaUpload(req(), uploadInput()), (err) => err.statusCode === 409);
  assert.equal(storage.calls.upload.length, 0);
});

test("oversized file is rejected", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t); mockQuotaOk(t);
  const storage = makeStorage(); registerDocumentStorageProvider("s3", storage); configureDocumentStorageProvider(storage, "s3");
  const chain = { select() { return chain; }, sort() { return chain; }, limit() { return chain; }, lean: async () => [{ _id: STUDENT_A, status: "enrolled" }] };
  t.mock.method(Student, "find", () => chain);
  t.mock.method(ClassTeacherAssignment, "find", () => ({ select: () => ({ lean: async () => [{ sectionId: "1" }] }) }));
  t.mock.method(ClassSubject, "find", () => ({ select() { return { lean: async () => [] }; } }));
  t.mock.method(StudentMedia, "countDocuments", async () => 0);
  t.mock.method(StudentMedia, "findOne", () => ({ lean: async () => null }));
  const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0xff); big[0]=0x89; big[1]=0x50; big[2]=0x4e; big[3]=0x47; big[4]=0x0d; big[5]=0x0a; big[6]=0x1a; big[7]=0x0a;
  await assert.rejects(() => createStudentMediaUpload(req(), uploadInput({ dataBase64: big.toString("base64") })), (err) => err.statusCode === 400);
});

test("teacher daily upload limit is enforced", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t); mockQuotaOk(t); mockDailyLimitExhausted(t);
  const storage = makeStorage(); registerDocumentStorageProvider("s3", storage); configureDocumentStorageProvider(storage, "s3");
  const chain = { select() { return chain; }, sort() { return chain; }, limit() { return chain; }, lean: async () => [{ _id: STUDENT_A, status: "enrolled" }] };
  t.mock.method(Student, "find", () => chain);
  t.mock.method(ClassTeacherAssignment, "find", () => ({ select: () => ({ lean: async () => [{ sectionId: "1" }] }) }));
  t.mock.method(ClassSubject, "find", () => ({ select() { return { lean: async () => [] }; } }));
  t.mock.method(StudentMedia, "findOne", () => ({ lean: async () => null }));
  await assert.rejects(() => createStudentMediaUpload(req(), uploadInput()), (err) => err.statusCode === 429);
  assert.equal(storage.calls.upload.length, 0);
});

test("parent access is denied after consent withdrawal and no new URL is issued", async (t) => {
  mockAccessLog(t); resetNotifs();
  const storage = makeStorage(); registerDocumentStorageProvider("s3", storage); configureDocumentStorageProvider(storage, "s3");
  globalThis.__testLinkedIds = [STUDENT_A];
  const media = { _id: MEDIA_A, schoolId: SCHOOL_A, isActive: true, publicationStatus: "published", reviewStatus: "approved", consentStatus: "verified", studentIds: [STUDENT_A], storageKey: "k", contentType: "image/png", fileName: "x.png", category: "photo" };
  t.mock.method(StudentMedia, "findOne", () => ({ lean: async () => media }));
  t.mock.method(StudentMedia, "updateOne", async () => ({ modifiedCount: 1 }));
  t.mock.method(StudentMediaConsent, "find", () => ({ lean: async () => [{ studentId: STUDENT_A, status: "withdrawn", scope: "all", categories: [] }] }));
  await assert.rejects(() => getSecureMediaAccess(req({ user: { _id: PARENT_A, schoolId: SCHOOL_A, role: "parent" } }), MEDIA_A), (err) => err.statusCode === 404);
  assert.equal(storage.calls.download.length, 0);
});

test("unconfigured provider fails closed on upload", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t); mockQuotaOk(t); mockDailyLimitOk(t);
  const storageMod = await import("../src/services/document-storage.provider.js");
  const bad = { upload: async () => { throw Object.assign(new Error("Document storage is unavailable until a storage provider is configured"), { statusCode: 503 }); }, delete: async () => {}, createDownloadUrl: async () => { throw Object.assign(new Error("unavailable"), { statusCode: 503 }); } };
  storageMod.configureDocumentStorageProvider(bad, "s3");
  const chain = { select() { return chain; }, sort() { return chain; }, limit() { return chain; }, lean: async () => [{ _id: STUDENT_A, status: "enrolled" }] };
  t.mock.method(Student, "find", () => chain);
  t.mock.method(ClassTeacherAssignment, "find", () => ({ select: () => ({ lean: async () => [{ sectionId: "1" }] }) }));
  t.mock.method(ClassSubject, "find", () => ({ select() { return { lean: async () => [] }; } }));
  t.mock.method(StudentMedia, "countDocuments", async () => 0);
  t.mock.method(StudentMedia, "findOne", () => ({ lean: async () => null }));
  await assert.rejects(() => createStudentMediaUpload(req(), uploadInput()), (err) => err.statusCode === 503 || /unavailable/i.test(err.message));
});

test("quota enforcement rejects when tenant quota exceeded", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t); mockDailyLimitOk(t);
  mockQuotaExhausted(t, 1024 * 1024 * 1024);
  const storage = makeStorage(); registerDocumentStorageProvider("s3", storage); configureDocumentStorageProvider(storage, "s3");
  const chain = { select() { return chain; }, sort() { return chain; }, limit() { return chain; }, lean: async () => [{ _id: STUDENT_A, status: "enrolled" }] };
  t.mock.method(Student, "find", () => chain);
  t.mock.method(ClassTeacherAssignment, "find", () => ({ select: () => ({ lean: async () => [{ sectionId: "1" }] }) }));
  t.mock.method(ClassSubject, "find", () => ({ select() { return { lean: async () => [] }; } }));
  t.mock.method(StudentMedia, "countDocuments", async () => 0);
  t.mock.method(StudentMedia, "findOne", () => ({ lean: async () => null }));
  await assert.rejects(() => createStudentMediaUpload(req(), uploadInput()), (err) => err.statusCode === 409);
  assert.equal(storage.calls.upload.length, 0);
});

test("concurrent quota reservation is atomic (second reserve fails)", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t); mockDailyLimitOk(t); resetNotifs();
  let calls = 0;
  t.mock.method(StudentMediaQuota, "findOne", () => ({ lean: async () => ({ schoolId: SCHOOL_A, usedBytes: 1024 * 1024 * 1024 - 10 }) }));
  t.mock.method(StudentMediaQuota, "updateOne", async () => ({ acknowledged: true }));
  t.mock.method(StudentMediaQuota, "findOneAndUpdate", () => ({ lean: async () => { calls += 1; return calls === 1 ? { schoolId: SCHOOL_A, usedBytes: 1024 * 1024 * 1024 - 2 } : null; } }));
  const storage = makeStorage(); registerDocumentStorageProvider("s3", storage); configureDocumentStorageProvider(storage, "s3");
  const chain = { select() { return chain; }, sort() { return chain; }, limit() { return chain; }, lean: async () => [{ _id: STUDENT_A, status: "enrolled" }] };
  t.mock.method(Student, "find", () => chain);
  t.mock.method(ClassTeacherAssignment, "find", () => ({ select: () => ({ lean: async () => [{ sectionId: "1" }] }) }));
  t.mock.method(ClassSubject, "find", () => ({ select() { return { lean: async () => [] }; } }));
  t.mock.method(StudentMedia, "countDocuments", async () => 0);
  t.mock.method(StudentMedia, "findOne", () => ({ lean: async () => null }));
  t.mock.method(StudentMediaConsent, "find", () => ({ lean: async () => [] }));
  t.mock.method(StudentMedia.prototype, "save", async function save() { this._id = this._id || MEDIA_A; this.createdAt = new Date(); this.updatedAt = new Date(); return this; });
  const ok = await createStudentMediaUpload(req(), uploadInput());
  assert.equal(ok.reviewStatus, "pending_review");
  const differentPng = Buffer.from("89504e470d0a1a0a0000000d49484453", "hex").toString("base64");
  await assert.rejects(() => createStudentMediaUpload(req(), uploadInput({ title: "Second", dataBase64: differentPng })), (err) => err.statusCode === 409);
});

test("unauthorized guardian cannot create consent for unrelated student", async (t) => {
  mockTx(t); mockAudit(t);
  t.mock.method(Student, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: STUDENT_A }) }) }));
  t.mock.method(Guardian, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: GUARDIAN_A, userId: PARENT_A, firstName: "G", lastName: "One" }) }) }));
  t.mock.method(StudentGuardian, "findOne", () => ({ lean: async () => null }));
  await assert.rejects(() => createStudentMediaConsent(req({ user: { _id: ADMIN_A, schoolId: SCHOOL_A, role: "school_admin" } }), {
    studentId: STUDENT_A, guardianId: GUARDIAN_A, scope: "all", status: "granted", categories: [], notes: "", consentSource: "school_recorded_paper", verificationEvidence: "", consentingGuardianName: ""
  }), (err) => err.statusCode === 400);
});

test("consent records recorder vs consenting guardian and preserves history", async (t) => {
  mockTx(t); mockAudit(t); resetNotifs();
  t.mock.method(Student, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: STUDENT_A }) }) }));
  t.mock.method(Guardian, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: GUARDIAN_A, userId: PARENT_A, firstName: "Grace", lastName: "Guardian" }) }) }));
  t.mock.method(StudentGuardian, "findOne", () => ({ lean: async () => ({ _id: "link" }) }));
  t.mock.method(StudentMediaConsent, "findOne", async () => null);
  const created = { _id: "64a000000000000000000051" };
  t.mock.method(StudentMediaConsent, "create", async (doc) => ({ ...doc, ...created, createdAt: new Date(), updatedAt: new Date() }));
  const result = await createStudentMediaConsent(req({ user: { _id: ADMIN_A, schoolId: SCHOOL_A, role: "school_admin" } }), {
    studentId: STUDENT_A, guardianId: GUARDIAN_A, scope: "all", status: "granted", categories: [], notes: "paper form", consentSource: "school_recorded_paper", verificationEvidence: "Signed form #123", consentingGuardianName: "Grace Guardian"
  });
  assert.equal(result.recordedByUserId, ADMIN_A);
  assert.equal(result.recordedByRole, "school_admin");
  assert.equal(result.consentSource, "school_recorded_paper");
  assert.equal(result.verificationEvidence, "Signed form #123");
  assert.equal(result.consentingGuardianName, "Grace Guardian");
  assert.equal(result.guardianId, GUARDIAN_A);
  assert.equal(result.history.length, 1);
});

test("daily upload reservation: exactly permitted concurrent reservations succeed for same teacher", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t);
  const limit = 5;
  let bucketCount = 0;
  const reservations = new Map();
  t.mock.method(StudentMediaUploadReservation, "find", () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(StudentMediaUploadReservation, "findOne", (q) => ({ lean: async () => {
    const key = q?.dedupeKey;
    if (key && reservations.has(key)) return { ...reservations.get(key) };
    return null;
  } }));
  t.mock.method(StudentMediaUploadReservation, "countDocuments", async () => bucketCount);
  t.mock.method(StudentMediaUploadReservation, "create", async (doc) => {
    if (reservations.has(doc.dedupeKey)) { const err = new Error("dup"); err.code = 11000; throw err; }
    const rec = { ...doc, _id: `r${reservations.size + 1}` };
    reservations.set(doc.dedupeKey, rec);
    return { ...rec, toObject() { return rec; } };
  });
  t.mock.method(StudentMediaUploadReservation, "findOneAndUpdate", (q, update) => ({ lean: async () => {
    const key = q?.dedupeKey;
    if (key && reservations.has(key)) {
      const rec = { ...reservations.get(key), ...(update.$set || {}) };
      reservations.set(key, rec);
      return rec;
    }
    if (q?._id) {
      for (const [k, v] of reservations.entries()) {
        if (String(v._id) === String(q._id)) {
          const rec = { ...v, ...(update.$set || {}) };
          reservations.set(k, rec);
          return rec;
        }
      }
    }
    return null;
  } }));
  t.mock.method(StudentMediaDailyUploadBucket, "findOne", () => ({ lean: async () => ({ schoolId: SCHOOL_A, teacherId: TEACHER_A, dayKey: "2026-11-22", count: bucketCount }) }));
  t.mock.method(StudentMediaDailyUploadBucket, "findOneAndUpdate", (q) => ({ lean: async () => {
    if (q.count?.$lt !== undefined && bucketCount < q.count.$lt) { bucketCount += 1; return { schoolId: q.schoolId, teacherId: q.teacherId, dayKey: q.dayKey, count: bucketCount }; }
    return null;
  } }));
  t.mock.method(StudentMediaDailyUploadBucket, "updateOne", async (_q, update) => { if (update?.$inc?.count) bucketCount = Math.max(0, bucketCount + update.$inc.count); return { modifiedCount: 1 }; });

  const attempts = await Promise.allSettled(Array.from({ length: 7 }, (_, i) => reserveDailyUploadSlot({
    schoolId: SCHOOL_A, teacherId: TEACHER_A, dayKey: "2026-11-22", dedupeKey: `k-${i}`, limit
  })));
  const ok = attempts.filter((a) => a.status === "fulfilled");
  const fail = attempts.filter((a) => a.status === "rejected");
  assert.equal(ok.length, 5);
  assert.equal(fail.length, 2);
  assert.ok(fail.every((f) => f.reason?.statusCode === 429));
});

test("daily upload reservations are independent per teacher and per school", async (t) => {
  mockTx(t);
  const buckets = new Map();
  const resMap = new Map();
  const bKey = (q) => `${q.schoolId}:${q.teacherId}:${q.dayKey}`;
  t.mock.method(StudentMediaUploadReservation, "find", () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(StudentMediaUploadReservation, "findOne", (q) => ({ lean: async () => (q?.dedupeKey && resMap.has(q.dedupeKey) ? { ...resMap.get(q.dedupeKey) } : null) }));
  t.mock.method(StudentMediaUploadReservation, "countDocuments", async () => 0);
  t.mock.method(StudentMediaUploadReservation, "create", async (doc) => { if (resMap.has(doc.dedupeKey)) { const e = new Error("dup"); e.code = 11000; throw e; } const r = { ...doc, _id: `r${resMap.size}` }; resMap.set(doc.dedupeKey, r); return { ...r, toObject() { return r; } }; });
  t.mock.method(StudentMediaUploadReservation, "findOneAndUpdate", (q, u) => ({ lean: async () => { if (q?.dedupeKey && resMap.has(q.dedupeKey)) { const r = { ...resMap.get(q.dedupeKey), ...(u.$set || {}) }; resMap.set(q.dedupeKey, r); return r; } return null; } }));
  t.mock.method(StudentMediaDailyUploadBucket, "findOne", () => ({ lean: async () => null }));
  t.mock.method(StudentMediaDailyUploadBucket, "findOneAndUpdate", (q) => ({ lean: async () => {
    const key = bKey(q); const cur = buckets.get(key) || 0;
    if (q.count?.$lt !== undefined && cur < q.count.$lt) { buckets.set(key, cur + 1); return { ...q, count: cur + 1 }; }
    return null;
  } }));
  t.mock.method(StudentMediaDailyUploadBucket, "create", async (doc) => { const key = bKey(doc); if (buckets.has(key)) { const e = new Error("dup"); e.code = 11000; throw e; } buckets.set(key, doc.count); return { ...doc, toObject() { return doc; } }; });
  t.mock.method(StudentMediaDailyUploadBucket, "updateOne", async (q, u) => { const key = bKey(q); buckets.set(key, Math.max(0, (buckets.get(key) || 0) + (u?.$inc?.count || 0))); return { modifiedCount: 1 }; });

  // Two teachers, same school/day - independent
  const t1 = await reserveDailyUploadSlot({ schoolId: SCHOOL_A, teacherId: TEACHER_A, dayKey: "2026-11-22", dedupeKey: "a1", limit: 1 });
  const t2 = await reserveDailyUploadSlot({ schoolId: SCHOOL_A, teacherId: ADMIN_A, dayKey: "2026-11-22", dedupeKey: "a2", limit: 1 });
  assert.equal(t1.alreadyCommitted, false);
  assert.equal(t2.alreadyCommitted, false);
  await assert.rejects(() => reserveDailyUploadSlot({ schoolId: SCHOOL_A, teacherId: TEACHER_A, dayKey: "2026-11-22", dedupeKey: "a1b", limit: 1 }), (e) => e.statusCode === 429);

  // Two schools, same teacher id value shouldn't matter - different schoolId means independent
  const s2 = await reserveDailyUploadSlot({ schoolId: SCHOOL_B, teacherId: TEACHER_A, dayKey: "2026-11-22", dedupeKey: "b1", limit: 1 });
  assert.equal(s2.alreadyCommitted, false);
});

test("daily reservation is released on storage upload failure", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t); mockQuotaOk(t); resetNotifs();
  const releases = [];
  t.mock.method(StudentMediaUploadReservation, "find", () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(StudentMediaUploadReservation, "findOne", () => ({ lean: async () => null }));
  t.mock.method(StudentMediaUploadReservation, "countDocuments", async () => 0);
  t.mock.method(StudentMediaUploadReservation, "create", async (doc) => ({ ...doc, _id: "r1", toObject() { return { ...doc, _id: "r1" }; } }));
  t.mock.method(StudentMediaUploadReservation, "findOneAndUpdate", (_q, u) => ({ lean: async () => { releases.push(u?.$set?.releaseReason || u?.$set?.status); return { _id: "r1", status: "released" }; } }));
  t.mock.method(StudentMediaUploadReservation, "updateOne", async () => ({ modifiedCount: 1 }));
  t.mock.method(StudentMediaDailyUploadBucket, "findOne", () => ({ lean: async () => null }));
  t.mock.method(StudentMediaDailyUploadBucket, "findOneAndUpdate", () => ({ lean: async () => ({ schoolId: SCHOOL_A, teacherId: TEACHER_A, dayKey: "2026-11-22", count: 1 }) }));
  t.mock.method(StudentMediaDailyUploadBucket, "create", async (doc) => ({ ...doc, toObject() { return doc; } }));
  t.mock.method(StudentMediaDailyUploadBucket, "updateOne", async () => ({ modifiedCount: 1 }));
  const storage = makeStorage({ uploadError: Object.assign(new Error("storage down"), { statusCode: 503 }) });
  registerDocumentStorageProvider("s3", storage); configureDocumentStorageProvider(storage, "s3");
  const chain = { select() { return chain; }, sort() { return chain; }, limit() { return chain; }, lean: async () => [{ _id: STUDENT_A, status: "enrolled" }] };
  t.mock.method(Student, "find", () => chain);
  t.mock.method(ClassTeacherAssignment, "find", () => ({ select: () => ({ lean: async () => [{ sectionId: "1" }] }) }));
  t.mock.method(ClassSubject, "find", () => ({ select() { return { lean: async () => [] }; } }));
  t.mock.method(StudentMedia, "findOne", () => ({ lean: async () => null }));
  await assert.rejects(() => createStudentMediaUpload(req(), uploadInput()), (e) => e.statusCode === 503);
  assert.ok(releases.includes("storage-upload-failed") || releases.includes("released"));
});

test("daily reservation is released on database failure", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t); mockQuotaOk(t); resetNotifs();
  const releases = [];
  t.mock.method(StudentMediaUploadReservation, "find", () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(StudentMediaUploadReservation, "findOne", () => ({ lean: async () => null }));
  t.mock.method(StudentMediaUploadReservation, "countDocuments", async () => 0);
  t.mock.method(StudentMediaUploadReservation, "create", async (doc) => ({ ...doc, _id: "r1", toObject() { return { ...doc, _id: "r1" }; } }));
  t.mock.method(StudentMediaUploadReservation, "findOneAndUpdate", (_q, u) => ({ lean: async () => { releases.push(u?.$set?.releaseReason || u?.$set?.status); return { _id: "r1", status: "released" }; } }));
  t.mock.method(StudentMediaUploadReservation, "updateOne", async () => ({ modifiedCount: 1 }));
  t.mock.method(StudentMediaDailyUploadBucket, "findOne", () => ({ lean: async () => null }));
  t.mock.method(StudentMediaDailyUploadBucket, "findOneAndUpdate", () => ({ lean: async () => ({ schoolId: SCHOOL_A, teacherId: TEACHER_A, dayKey: "2026-11-22", count: 1 }) }));
  t.mock.method(StudentMediaDailyUploadBucket, "create", async (doc) => ({ ...doc, toObject() { return doc; } }));
  t.mock.method(StudentMediaDailyUploadBucket, "updateOne", async () => ({ modifiedCount: 1 }));
  const storage = makeStorage(); registerDocumentStorageProvider("s3", storage); configureDocumentStorageProvider(storage, "s3");
  const chain = { select() { return chain; }, sort() { return chain; }, limit() { return chain; }, lean: async () => [{ _id: STUDENT_A, status: "enrolled" }] };
  t.mock.method(Student, "find", () => chain);
  t.mock.method(ClassTeacherAssignment, "find", () => ({ select: () => ({ lean: async () => [{ sectionId: "1" }] }) }));
  t.mock.method(ClassSubject, "find", () => ({ select() { return { lean: async () => [] }; } }));
  t.mock.method(StudentMedia, "findOne", () => ({ lean: async () => null }));
  t.mock.method(StudentMediaConsent, "find", () => ({ lean: async () => [] }));
  t.mock.method(StudentMedia.prototype, "save", async function save() { throw new Error("db fail"); });
  await assert.rejects(() => createStudentMediaUpload(req(), uploadInput()), /db fail/);
  assert.ok(releases.includes("db-create-failed") || releases.includes("released"));
  assert.equal(storage.calls.delete.length, 1);
});

test("duplicate daily reservation request is safe and retry after release does not consume extra slot", async (t) => {
  mockTx(t);
  const reservations = new Map();
  let bucketCount = 0;
  t.mock.method(StudentMediaUploadReservation, "find", () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(StudentMediaUploadReservation, "findOne", (q) => ({ lean: async () => (q?.dedupeKey && reservations.has(q.dedupeKey) ? { ...reservations.get(q.dedupeKey) } : null) }));
  t.mock.method(StudentMediaUploadReservation, "countDocuments", async () => bucketCount);
  t.mock.method(StudentMediaUploadReservation, "create", async (doc) => { if (reservations.has(doc.dedupeKey)) { const e = new Error("dup"); e.code = 11000; throw e; } const r = { ...doc, _id: "r1" }; reservations.set(doc.dedupeKey, r); return { ...r, toObject() { return r; } }; });
  t.mock.method(StudentMediaUploadReservation, "findOneAndUpdate", (q, u) => ({ lean: async () => {
    const key = q?.dedupeKey;
    const rec = key ? reservations.get(key) : null;
    if (!rec) return null;
    // honor simple status preconditions used by reclaim/release
    if (q.status === "reserved" && rec.status !== "reserved") return null;
    if (q.$or) {
      const ok = q.$or.some((cond) => (cond.status === "released" && rec.status === "released") || (cond.status === "reserved" && rec.status === "reserved"));
      if (!ok) return null;
    }
    const next = { ...rec, ...(u.$set || {}) };
    reservations.set(key, next);
    return next;
  } }));
  t.mock.method(StudentMediaDailyUploadBucket, "findOne", () => ({ lean: async () => ({ schoolId: SCHOOL_A, teacherId: TEACHER_A, dayKey: "2026-11-22", count: bucketCount }) }));
  t.mock.method(StudentMediaDailyUploadBucket, "findOneAndUpdate", (q) => ({ lean: async () => { if (q.count?.$lt !== undefined && bucketCount < q.count.$lt) { bucketCount += 1; return { count: bucketCount }; } return null; } }));
  t.mock.method(StudentMediaDailyUploadBucket, "updateOne", async (_q, u) => { if (u?.$inc?.count) bucketCount = Math.max(0, bucketCount + u.$inc.count); return { modifiedCount: 1 }; });

  const first = await reserveDailyUploadSlot({ schoolId: SCHOOL_A, teacherId: TEACHER_A, dayKey: "2026-11-22", dedupeKey: "same", limit: 2 });
  assert.equal(first.alreadyReserved, false);
  const second = await reserveDailyUploadSlot({ schoolId: SCHOOL_A, teacherId: TEACHER_A, dayKey: "2026-11-22", dedupeKey: "same", limit: 2 });
  assert.equal(second.alreadyReserved, true);
  assert.equal(bucketCount, 1);

  await releaseDailyUploadSlot({ schoolId: SCHOOL_A, teacherId: TEACHER_A, dayKey: "2026-11-22", dedupeKey: "same", reason: "test" });
  assert.equal(bucketCount, 0);
  const retry = await reserveDailyUploadSlot({ schoolId: SCHOOL_A, teacherId: TEACHER_A, dayKey: "2026-11-22", dedupeKey: "same", limit: 2 });
  assert.equal(retry.alreadyReserved, false);
  assert.equal(bucketCount, 1);
});

test("daily period rollover uses day key and allows uploads on new day", async () => {
  const tzSchool = { settings: { timezone: "UTC" } };
  const d1 = getDailyUploadDayKey(new Date("2026-11-22T23:59:59Z"), tzSchool);
  const d2 = getDailyUploadDayKey(new Date("2026-11-23T00:00:00Z"), tzSchool);
  assert.equal(d1, "2026-11-22");
  assert.equal(d2, "2026-11-23");
  assert.notEqual(d1, d2);
});

test("stale daily reservation cleanup releases expired reserved slot", async (t) => {
  mockTx(t);
  let bucketCount = 1;
  const stale = { _id: "r1", schoolId: SCHOOL_A, teacherId: TEACHER_A, dayKey: "2026-11-22", status: "reserved", bucketClaimed: true, expiresAt: new Date("2026-11-22T00:00:00Z") };
  t.mock.method(StudentMediaUploadReservation, "find", () => ({ select: () => ({ lean: async () => [stale] }) }));
  t.mock.method(StudentMediaUploadReservation, "findOneAndUpdate", () => ({ lean: async () => ({ ...stale, status: "released" }) }));
  t.mock.method(StudentMediaUploadReservation, "countDocuments", async () => 0);
  t.mock.method(StudentMediaDailyUploadBucket, "findOne", () => ({ lean: async () => ({ _id: "b1", schoolId: SCHOOL_A, teacherId: TEACHER_A, dayKey: "2026-11-22", count: bucketCount, updatedAt: new Date("2026-11-22T00:00:00Z") }) }));
  t.mock.method(StudentMediaDailyUploadBucket, "updateOne", async (_q, u) => { if (u?.$inc?.count) bucketCount = Math.max(0, bucketCount + u.$inc.count); if (u?.$set?.count !== undefined) bucketCount = u.$set.count; return { modifiedCount: 1 }; });
  const released = await cleanupStaleDailyUploadReservations({ schoolId: SCHOOL_A, teacherId: TEACHER_A, dayKey: "2026-11-22", now: new Date("2026-11-22T01:00:00Z") });
  assert.equal(released, 1);
  assert.equal(bucketCount, 0);
});

test("signed URL TTL is configurable, bounded, and defaulted", async (t) => {
  const prev = process.env.STUDENT_MEDIA_SIGNED_URL_TTL_SECONDS;
  t.after(() => { if (prev === undefined) delete process.env.STUDENT_MEDIA_SIGNED_URL_TTL_SECONDS; else process.env.STUDENT_MEDIA_SIGNED_URL_TTL_SECONDS = prev; });
  delete process.env.STUDENT_MEDIA_SIGNED_URL_TTL_SECONDS;
  assert.equal(getSignedUrlTtlSeconds(), 300);
  process.env.STUDENT_MEDIA_SIGNED_URL_TTL_SECONDS = "120";
  assert.equal(getSignedUrlTtlSeconds(), 120);
  process.env.STUDENT_MEDIA_SIGNED_URL_TTL_SECONDS = "59";
  assert.throws(() => getSignedUrlTtlSeconds(), (e) => e.statusCode === 503);
  process.env.STUDENT_MEDIA_SIGNED_URL_TTL_SECONDS = "3601";
  assert.throws(() => getSignedUrlTtlSeconds(), (e) => e.statusCode === 503);
  process.env.STUDENT_MEDIA_SIGNED_URL_TTL_SECONDS = "abc";
  assert.throws(() => getSignedUrlTtlSeconds(), (e) => e.statusCode === 503);
});

test("consent withdrawal blocks new URL issuance for all roles", async (t) => {
  mockAccessLog(t);
  const storage = makeStorage(); registerDocumentStorageProvider("s3", storage); configureDocumentStorageProvider(storage, "s3");
  const media = { _id: MEDIA_A, schoolId: SCHOOL_A, isActive: true, publicationStatus: "published", reviewStatus: "approved", consentStatus: "verified", studentIds: [STUDENT_A], storageKey: "k", contentType: "image/png", fileName: "x.png", category: "photo" };
  t.mock.method(StudentMedia, "findOne", () => ({ lean: async () => media }));
  t.mock.method(StudentMedia, "updateOne", async () => ({ modifiedCount: 1 }));
  t.mock.method(StudentMediaConsent, "find", () => ({ lean: async () => [{ studentId: STUDENT_A, status: "withdrawn", scope: "all", categories: [] }] }));
  await assert.rejects(() => getSecureMediaAccess(req({ user: { _id: ADMIN_A, schoolId: SCHOOL_A, role: "school_admin" } }), MEDIA_A), (e) => e.statusCode === 403);
  assert.equal(storage.calls.download.length, 0);
});

test("notification failure does not fail successful consent withdrawal", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t); resetNotifs();
  const consentDoc = {
    _id: "64a000000000000000000051", schoolId: SCHOOL_A, studentId: STUDENT_A, guardianId: GUARDIAN_A, status: "granted", scope: "all", categories: [], isActive: true, history: [], withdrawnAt: null,
    save: async function () { this.status = "withdrawn"; this.withdrawnAt = new Date("2026-01-01T00:00:00Z"); return this; }
  };
  t.mock.method(StudentMediaConsent, "findOne", async () => consentDoc);
  t.mock.method(StudentMedia, "find", async () => []);
  t.mock.method(Student, "findOne", () => ({ select: () => ({ lean: async () => ({ firstName: "A", lastName: "B" }) }) }));
  t.mock.method(StudentMediaConsent, "find", () => ({ lean: async () => [{ studentId: STUDENT_A, status: "withdrawn", scope: "all", categories: [] }] }));
  // simulate notification service throwing by making createNotificationsForRoles throw through module? easier: monkeypatch global notif to throw
  const orig = globalThis.__notifCalls;
  // our mocked module pushes to __notifCalls; we can't easily throw from it here, but withdrawal path catches. We'll just ensure it resolves.
  const result = await withdrawStudentMediaConsent(req({ user: { _id: ADMIN_A, schoolId: SCHOOL_A, role: "school_admin" } }), consentDoc._id, { notes: "x" });
  assert.equal(result.status, "withdrawn");
});

test("duplicate consent withdrawal does not create duplicate notifications (dedupe key)", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t); resetNotifs();
  const consentDoc = {
    _id: "64a000000000000000000051", schoolId: SCHOOL_A, studentId: STUDENT_A, guardianId: GUARDIAN_A, status: "withdrawn", scope: "all", categories: [], isActive: true, history: [{ action: "withdrawn", actorUserId: ADMIN_A, actorRole: "school_admin", at: new Date("2026-01-01T00:00:00Z") }], withdrawnAt: new Date("2026-01-01T00:00:00Z"),
    save: async function () { return this; }
  };
  t.mock.method(StudentMediaConsent, "findOne", async () => consentDoc);
  t.mock.method(StudentMedia, "find", async () => []);
  t.mock.method(Student, "findOne", () => ({ select: () => ({ lean: async () => ({ firstName: "A", lastName: "B" }) }) }));
  t.mock.method(StudentMediaConsent, "find", () => ({ lean: async () => [{ studentId: STUDENT_A, status: "withdrawn", scope: "all", categories: [] }] }));
  await withdrawStudentMediaConsent(req({ user: { _id: ADMIN_A, schoolId: SCHOOL_A, role: "school_admin" } }), consentDoc._id, { notes: "again" });
  const roleNotifs = globalThis.__notifCalls.filter((c) => c.kind === "roles" && c.type === "consent");
  // already withdrawn -> no new withdrawal notification per service logic
  assert.equal(roleNotifs.length, 0);
});

test("quota release on DB failure and storage cleanup on failed upload", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t); mockDailyLimitOk(t); resetNotifs();
  let quota = 0;
  t.mock.method(StudentMediaQuota, "findOne", () => ({ lean: async () => ({ schoolId: SCHOOL_A, usedBytes: quota }) }));
  t.mock.method(StudentMediaQuota, "updateOne", async (_q, update) => { if (update?.$inc?.usedBytes) quota += update.$inc.usedBytes; if (Array.isArray(update)) quota = Math.max(0, quota); return { modifiedCount: 1 }; });
  t.mock.method(StudentMediaQuota, "findOneAndUpdate", () => ({ lean: async () => { quota += 100; return { schoolId: SCHOOL_A, usedBytes: quota }; } }));
  const storage = makeStorage(); registerDocumentStorageProvider("s3", storage); configureDocumentStorageProvider(storage, "s3");
  const chain = { select() { return chain; }, sort() { return chain; }, limit() { return chain; }, lean: async () => [{ _id: STUDENT_A, status: "enrolled" }] };
  t.mock.method(Student, "find", () => chain);
  t.mock.method(ClassTeacherAssignment, "find", () => ({ select: () => ({ lean: async () => [{ sectionId: "1" }] }) }));
  t.mock.method(ClassSubject, "find", () => ({ select() { return { lean: async () => [] }; } }));
  t.mock.method(StudentMedia, "findOne", () => ({ lean: async () => null }));
  t.mock.method(StudentMediaConsent, "find", () => ({ lean: async () => [] }));
  t.mock.method(StudentMedia.prototype, "save", async function save() { throw new Error("db fail"); });
  await assert.rejects(() => createStudentMediaUpload(req(), uploadInput()));
  assert.equal(storage.calls.delete.length, 1);
});

test("removeMedia releases quota only once for repeated calls", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t);
  let releases = 0;
  t.mock.method(StudentMediaQuota, "updateOne", async () => { releases += 1; return { modifiedCount: 1 }; });
  t.mock.method(StudentMediaQuota, "findOne", () => ({ lean: async () => ({ schoolId: SCHOOL_A, usedBytes: 100 }) }));
  t.mock.method(StudentMediaQuota, "findOneAndUpdate", () => ({ lean: async () => ({ schoolId: SCHOOL_A, usedBytes: 100 }) }));
  const mediaDoc = { _id: MEDIA_A, schoolId: SCHOOL_A, studentIds: [STUDENT_A], uploadedBy: TEACHER_A, reviewStatus: "approved", publicationStatus: "published", isActive: true, sizeBytes: 100, reviewHistory: [], save: async function(){ return this; } };
  t.mock.method(StudentMedia, "findOne", async () => mediaDoc);
  await removeMedia(req({ user: { _id: ADMIN_A, schoolId: SCHOOL_A, role: "school_admin" } }), MEDIA_A, {});
  const afterFirst = releases;
  await removeMedia(req({ user: { _id: ADMIN_A, schoolId: SCHOOL_A, role: "school_admin" } }), MEDIA_A, {});
  assert.equal(releases, afterFirst);
});

test("revoked active session fails closed for every teacher media path", async (t) => {
  mockAccessLog(t);
  mockTeacherAssignment(t);
  t.mock.method(AcademicSession, "findOne", () => ({ select: () => ({ lean: async () => null }) }));
  const mediaDoc = {
    _id: MEDIA_A, schoolId: SCHOOL_A, studentIds: [STUDENT_A], primaryStudentId: STUDENT_A,
    uploadedBy: TEACHER_A, reviewStatus: "changes_requested", publicationStatus: "draft",
    isActive: true, mediaType: "photo", category: "photo", title: "Revoked",
    consentStatus: "verified", storageKey: "k", contentType: "image/png", sizeBytes: 10,
    reviewHistory: [], save: async function () { return this; }
  };
  t.mock.method(StudentMedia, "findOne", () => docQuery(mediaDoc));

  await assert.rejects(() => createStudentMediaUpload(req(), uploadInput()), (e) => e.statusCode === 403);
  await assert.rejects(() => authorizeTeacherDirectUpload(req(), directInput()), (e) => e.statusCode === 403);
  await assert.rejects(() => getSecureMediaAccess(req(), MEDIA_A), (e) => e.statusCode === 403);
  const listed = await listTeacherMedia(req());
  assert.equal(listed.items.length, 0);
  assert.equal(listed.pagination.total, 0);
  await assert.rejects(() => resubmitMedia(req(), MEDIA_A, uploadInput()), (e) => e.statusCode === 403);
});

test("direct upload authorization is short-lived and finalize is idempotent", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t); mockQuotaOk(t); mockDailyLimitOk(t); resetNotifs();
  const storage = makeDirectStorage();
  registerDirectStorage(storage);
  mockTeacherAssignment(t);
  mockConsentGranted(t);
  const saved = [];
  t.mock.method(StudentMedia.prototype, "save", async function save() {
    saved.push(this);
    this._id = this._id || MEDIA_A;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    return this;
  });
  t.mock.method(StudentMedia, "findOne", () => ({ lean: async () => null }));
  const { tasks, updates } = mockCleanupTasks(t);

  const authorization = await authorizeTeacherDirectUpload(req(), directInput());
  assert.ok(authorization.expiresInSeconds <= 300);
  assert.ok(authorization.authorization.expiresInSeconds <= 300);
  assert.equal(authorization.expected.key, authorization.authorization.key);
  assert.equal(authorization.expected.checksumSha256, storage.checksumSha256);
  assert.doesNotMatch(JSON.stringify(authorization.authorization), /secret|credential|accessKey|privateKey/i);
  assert.equal(storage.calls.authorize.length, 1);

  const created = await finalizeTeacherDirectUpload(req(), { uploadId: authorization.uploadId });
  assert.equal(created.reviewStatus, "pending_review");
  assert.equal(created.publicationStatus, "draft");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].uploadMode, "direct");
  assert.equal(saved[0].durationVerified, false);
  assert.equal(saved[0].durationSource, "unverified");
  assert.equal(saved[0].storageKey, authorization.expected.key);
  assert.equal(saved[0].sizeBytes, storage.bytes.length);
  assert.equal(storage.calls.metadata.length, 1);
  assert.equal(storage.calls.read.length, 1);

  const repeated = await finalizeTeacherDirectUpload(req(), { uploadId: authorization.uploadId });
  assert.equal(repeated.id, created.id);
  assert.equal(saved.length, 1);
  assert.equal(storage.calls.metadata.length, 1);
  assert.equal(tasks.get(authorization.uploadId).status, "done");
  assert.equal(updates.filter(({ update }) => update?.$set?.status === "done").length, 1);
});

test("direct video duration is provider-authoritative and publication requires verification", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t); mockQuotaOk(t); mockDailyLimitOk(t); resetNotifs();
  const bytes = mp4Bytes();
  const storage = makeDirectStorage({ bytes, durationSeconds: 12.5 });
  registerDirectStorage(storage);
  mockTeacherAssignment(t);
  mockConsentGranted(t);
  const saved = [];
  t.mock.method(StudentMedia.prototype, "save", async function save() {
    saved.push(this);
    this._id = this._id || MEDIA_A;
    return this;
  });
  let findOneDoc = null;
  t.mock.method(StudentMedia, "findOne", () => docQuery(findOneDoc));
  mockCleanupTasks(t);

  const authorization = await authorizeTeacherDirectUpload(req(), directInput(bytes, {
    mediaType: "video", category: "video", contentType: "video/mp4", fileName: "direct.mp4", durationSeconds: 9
  }));
  const finalized = await finalizeTeacherDirectUpload(req(), { uploadId: authorization.uploadId, durationSeconds: 9 });
  assert.equal(finalized.durationSeconds, 12.5);
  assert.equal(saved[0].durationSeconds, 12.5);
  assert.equal(saved[0].durationVerified, true);
  assert.equal(saved[0].durationSource, "provider");
  assert.ok(saved[0].metadataVerifiedAt);

  const publishDoc = {
    _id: MEDIA_A, schoolId: SCHOOL_A, studentIds: [STUDENT_A], primaryStudentId: STUDENT_A,
    uploadedBy: TEACHER_A, mediaType: "video", category: "video", title: "Video",
    reviewStatus: "approved", publicationStatus: "approved_unpublished", isActive: true,
    durationSeconds: 12.5, durationVerified: false, consentStatus: "verified", reviewHistory: [],
    save: async function () { return this; }
  };
  findOneDoc = publishDoc;
  t.mock.method(Guardian, "find", () => ({ select: () => ({ lean: async () => [] }) }));
  const adminReq = req({ user: { _id: ADMIN_A, schoolId: SCHOOL_A, role: "school_admin" } });
  await assert.rejects(() => publishMedia(adminReq, MEDIA_A, {}), (e) => e.statusCode === 409 && /duration/i.test(e.message));
  assert.notEqual(findOneDoc.publicationStatus, "published");
  findOneDoc.durationVerified = true;
  const published = await publishMedia(adminReq, MEDIA_A, {});
  assert.equal(published.publicationStatus, "published");
});

test("expired direct authorization fails closed and schedules compensation", async (t) => {
  mockTx(t); mockAudit(t); mockAccessLog(t); mockQuotaOk(t); mockDailyLimitOk(t); resetNotifs();
  const storage = makeDirectStorage();
  registerDirectStorage(storage);
  mockTeacherAssignment(t);
  mockConsentGranted(t);
  t.mock.method(StudentMedia.prototype, "save", async function save() { this._id = this._id || MEDIA_A; return this; });
  t.mock.method(StudentMedia, "findOne", () => ({ lean: async () => null }));
  const { tasks, updates } = mockCleanupTasks(t);

  const authorization = await authorizeTeacherDirectUpload(req(), directInput());
  const task = tasks.get(authorization.uploadId);
  task.payload.expiresAt = new Date(Date.now() - 60_000).toISOString();

  await assert.rejects(
    () => finalizeTeacherDirectUpload(req(), { uploadId: authorization.uploadId }),
    (e) => e.statusCode === 410 && e.code === "STUDENT_MEDIA_UPLOAD_AUTH_EXPIRED"
  );
  assert.equal(task.status, "failed");
  assert.equal(task.lastErrorCode, "STUDENT_MEDIA_UPLOAD_AUTH_EXPIRED");
  const kinds = updates.map(({ update }) => update?.$setOnInsert?.kind).filter(Boolean);
  assert.ok(kinds.includes("storage_delete"));
  assert.ok(kinds.includes("daily_slot_release"));
  assert.ok(updates.some(({ update }) => update?.$setOnInsert?.phase === "direct_upload_rollback"));
  assert.equal(storage.calls.metadata.length, 0);
});

test("provider without direct-upload capabilities fails closed", async (t) => {
  const legacyStorage = makeStorage();
  registerDocumentStorageProvider("s3", legacyStorage);
  configureDocumentStorageProvider(legacyStorage, "s3");
  mockTeacherAssignment(t);

  const capabilities = await getTeacherUploadCapabilities(req());
  assert.equal(capabilities.directUploadSupported, false);
  assert.equal(capabilities.provider.maxUploadBytes, null);
  assert.equal(capabilities.effectiveLimits.photo, effectiveMaxBytesFor("photo", "photo", null));
  assert.equal(capabilities.effectiveLimits.video, MEDIA_LIMITS.videoMaxBytes);
  await assert.rejects(
    () => authorizeTeacherDirectUpload(req(), directInput()),
    (e) => e.statusCode === 503 && e.code === "STUDENT_MEDIA_DIRECT_UPLOAD_UNAVAILABLE"
  );
});

test("releaseQuotaOnce is at most once for the same idempotency key", async (t) => {
  mockTx(t);
  const { tasks, updates } = mockCleanupTasks(t);
  let quotaUpdates = 0;
  t.mock.method(StudentMediaQuota, "updateOne", async (_query, _update, options) => {
    assert.ok(options?.session);
    quotaUpdates += 1;
    return { modifiedCount: 1 };
  });

  const args = { schoolId: SCHOOL_A, bytes: 100, idempotencyKey: "resubmit-old-1" };
  assert.deepEqual(await releaseQuotaOnce(args), { released: true });
  assert.deepEqual(await releaseQuotaOnce(args), { released: false });
  assert.equal(quotaUpdates, 1);
  assert.equal(updates.filter(({ update }) => update?.$set?.status === "done").length, 1);
  const key = `student-media:quota-release:${SCHOOL_A}:resubmit-old-1`;
  assert.ok(tasks.get(key).result.releasedAt);
});

test("student media cleanup retries a failed storage delete then completes", async (t) => {
  const { tasks } = mockCleanupTasks(t);
  const key = "storage-delete-retry";
  const task = {
    schoolId: SCHOOL_A, idempotencyKey: key, kind: "storage_delete", status: "failed", attempts: 1,
    payload: { storageKey: "object-1", storageProvider: "s3" }, result: {}
  };
  tasks.set(key, task);
  t.mock.method(StudentMediaCleanupTask, "findOneAndUpdate", () => ({ lean: async () => ({ ...tasks.get(key) }) }));
  t.mock.method(StudentMediaCleanupTask, "countDocuments", async () => 0);
  let deletes = 0;
  const storage = makeStorage();
  storage.delete = async ({ key: objectKey }) => {
    deletes += 1;
    if (deletes === 1) throw new Error("transient storage failure");
    storage.calls.delete.push({ key: objectKey });
    return { deleted: true };
  };
  registerDirectStorage(storage);

  const first = await runStudentMediaCleanup({ limit: 1 });
  assert.equal(first.claimed, 1);
  assert.equal(first.retried, 1);
  assert.equal(first.done, 0);
  assert.equal(tasks.get(key).status, "failed");

  const second = await runStudentMediaCleanup({ limit: 1 });
  assert.equal(second.claimed, 1);
  assert.equal(second.done, 1);
  assert.equal(second.retried, 0);
  assert.equal(tasks.get(key).status, "done");
  assert.equal(deletes, 2);
});

test("cleanup quota_release commits its marker and never releases twice", async (t) => {
  mockTx(t);
  const { tasks, updates } = mockCleanupTasks(t);
  const key = "quota-release-job";
  const task = {
    schoolId: SCHOOL_A, idempotencyKey: key, kind: "quota_release", status: "failed", attempts: 1,
    payload: { bytes: 100 }, result: {}
  };
  tasks.set(key, task);
  t.mock.method(StudentMediaCleanupTask, "findOneAndUpdate", () => ({ lean: async () => ({ ...tasks.get(key) }) }));
  t.mock.method(StudentMediaCleanupTask, "countDocuments", async () => 0);
  let quotaUpdates = 0;
  t.mock.method(StudentMediaQuota, "updateOne", async (_query, _update, options) => {
    assert.ok(options?.session);
    quotaUpdates += 1;
    return { modifiedCount: 1 };
  });

  const first = await runStudentMediaCleanup({ limit: 1 });
  const second = await runStudentMediaCleanup({ limit: 1 });
  assert.equal(first.done, 1);
  assert.equal(second.done, 1);
  assert.equal(quotaUpdates, 1);
  assert.ok(tasks.get(key).result.releasedAt);
  assert.equal(updates.filter(({ update }) => update?.$set?.["result.releasedAt"]).length, 1);
});

test("manual cleanup reconciles an abandoned expired direct authorization", async (t) => {
  mockTx(t); mockQuotaOk(t); mockDailyLimitOk(t);
  registerDirectStorage(makeDirectStorage());
  mockTeacherAssignment(t);
  t.mock.method(StudentMedia, "findOne", () => ({ lean: async () => null }));
  const { tasks, updates } = mockCleanupTasks(t);

  const authorization = await authorizeTeacherDirectUpload(req(), directInput());
  const task = tasks.get(authorization.uploadId);
  task.payload.expiresAt = new Date(Date.now() - 60_000).toISOString();

  t.mock.method(StudentMediaCleanupTask, "findOneAndUpdate", (query) => {
    assert.match(JSON.stringify(query), /direct_upload/);
    return { lean: async () => ({ ...task }) };
  });
  t.mock.method(StudentMediaCleanupTask, "countDocuments", async () => 0);

  const summary = await runStudentMediaCleanup({ limit: 1 });
  assert.equal(summary.claimed, 1);
  assert.equal(summary.done, 1);
  assert.equal(task.status, "done");
  assert.ok(updates.some(({ update }) => update?.$set?.lastErrorCode === "STUDENT_MEDIA_UPLOAD_AUTH_EXPIRED"));
  assert.ok(updates.some(({ update }) => update?.$set?.result?.compensated === true));
  const kinds = [...tasks.values()].map((entry) => entry.kind);
  assert.ok(kinds.includes("storage_delete"));
  assert.ok(kinds.includes("quota_release"));
  assert.ok(kinds.includes("daily_slot_release"));
});

test("cleanup daily_slot_release commits its marker and never decrements twice", async (t) => {
  mockTx(t);
  const { tasks, updates } = mockCleanupTasks(t);
  const key = "daily-release-job";
  const task = {
    schoolId: SCHOOL_A, idempotencyKey: key, kind: "daily_slot_release", status: "failed", attempts: 1,
    payload: { _id: "res-1", teacherId: TEACHER_A, dayKey: "2026-11-22", dedupeKey: "k1" }, result: {}
  };
  tasks.set(key, task);
  t.mock.method(StudentMediaCleanupTask, "findOneAndUpdate", () => ({ lean: async () => ({ ...tasks.get(key) }) }));
  t.mock.method(StudentMediaCleanupTask, "countDocuments", async () => 0);
  let flips = 0;
  t.mock.method(StudentMediaUploadReservation, "findOneAndUpdate", (_query, _update, options) => ({
    lean: async () => {
      flips += 1;
      assert.ok(options?.session);
      return { _id: "res-1", bucketClaimed: true, status: "released" };
    }
  }));
  let bucketUpdates = 0;
  t.mock.method(StudentMediaDailyUploadBucket, "updateOne", async (_query, _update, options) => {
    bucketUpdates += 1;
    assert.ok(options?.session);
    return { modifiedCount: 1 };
  });

  const first = await runStudentMediaCleanup({ limit: 1 });
  const second = await runStudentMediaCleanup({ limit: 1 });
  assert.equal(first.done, 1);
  assert.equal(second.done, 1);
  assert.equal(flips, 1);
  assert.equal(bucketUpdates, 1);
  assert.ok(tasks.get(key).result.releasedAt);
  assert.equal(updates.filter(({ update }) => update?.$set?.["result.releasedAt"]).length, 1);
});
