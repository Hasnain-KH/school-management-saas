import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";
import mongoose from "mongoose";

mock.module("../src/utils/audit.js", { namedExports: { writeAuditLog: async () => {} } });

const { toMinorUnits, parseMoneyInput } = await import("../src/utils/currency.js");
const { default: AcademicSession } = await import("../src/models/academic-session.model.js");
const { default: AuditLog } = await import("../src/models/audit-log.model.js");
const { default: ClassSubject } = await import("../src/models/class-subject.model.js");
const { default: ClassTeacherAssignment } = await import("../src/models/class-teacher-assignment.model.js");
const { default: FeePayment } = await import("../src/models/fee-payment.model.js");
const { default: FeeVoucher } = await import("../src/models/fee-voucher.model.js");
const { default: FeeStructure } = await import("../src/models/fee-structure.model.js");
const { default: FixedAsset } = await import("../src/models/fixed-asset.model.js");
const { default: FixedAssetDepreciation } = await import("../src/models/fixed-asset-depreciation.model.js");
const { default: School } = await import("../src/models/school.model.js");
const { default: SchoolDocument } = await import("../src/models/document.model.js");
const { default: Student } = await import("../src/models/student.model.js");
const { default: StudentFeeAssignment } = await import("../src/models/student-fee-assignment.model.js");
const { default: StudentMedia } = await import("../src/models/student-media.model.js");
const { default: StudentMediaAccessLog } = await import("../src/models/student-media-access-log.model.js");
const { default: StudentMediaConsent } = await import("../src/models/student-media-consent.model.js");
const { configureDocumentStorageProvider, registerDocumentStorageProvider } = await import("../src/services/document-storage.provider.js");
const { createDocument } = await import("../src/services/document.service.js");
const { configureSchoolCurrency, schoolHasFinancialTransactions, detectFinancialScaleConflicts } = await import("../src/services/school.service.js");
const { evaluateMediaConsent, getSecureMediaAccess, getStudentMediaUsageSummary } = await import("../src/services/student-media.service.js");
const { hasPermission } = await import("../src/middleware/authorization.middleware.js");
const { createRateLimitMiddlewares } = await import("../src/middleware/rate-limit.middleware.js");
const { errorHandler } = await import("../src/middleware/error.middleware.js");
const { detectFileSignature, isDeclaredTypeCompatible } = await import("../src/utils/file-signature.js");
const { clampSignedUrlTtl } = await import("../src/utils/signed-url-ttl.js");

const SCHOOL_A = "64a000000000000000000001";
const SCHOOL_B = "64a000000000000000000002";
const USER_A = "64a000000000000000000011";
const ADMIN_A = "64a000000000000000000012";
const TEACHER_A = "64a000000000000000000013";
const STUDENT_A = "64a000000000000000000021";
const MEDIA_A = "64a000000000000000000041";
const ACTIVE_SESSION = "64a000000000000000000098";

const mockTx = (t) => t.mock.method(mongoose, "startSession", async () => ({
  withTransaction: async (fn) => fn(),
  endSession: async () => {}
}));

const reqFor = (overrides = {}) => ({
  user: { _id: USER_A, schoolId: SCHOOL_A, role: "school_admin", ...(overrides.user || {}) },
  school: { _id: SCHOOL_A, ...(overrides.school || {}) }
});

beforeEach((t) => {
  t.mock.method(AcademicSession, "findOne", () => ({
    select() {
      return { lean: async () => ({ _id: ACTIVE_SESSION }) };
    }
  }));
});

test("numeric money conversion rounds half-up instead of truncating binary float artifacts", () => {
  assert.equal(toMinorUnits(8.575, "USD"), 858);
  assert.equal(toMinorUnits(10.075, "USD"), 1008);
  assert.equal(toMinorUnits(0.1 + 0.2, "USD"), 30);
  assert.equal(toMinorUnits(12.345, "KWD"), 12345);
  assert.throws(() => parseMoneyInput(8.575, "USD"), /decimal place/i);
  assert.equal(parseMoneyInput("8.57", "USD"), 857);
});

test("every financial model participates in currency locking and scale checks are session-bound", async (t) => {
  const seen = [];
  const session = { id: "session" };
  const sessionQuery = (name) => ({
    session(value) { assert.equal(value, session); seen.push(name); return this; },
    then(resolve) { resolve(null); }
  });
  t.mock.method(FeePayment, "exists", () => sessionQuery("payment"));
  t.mock.method(FeeVoucher, "exists", () => sessionQuery("voucher"));
  t.mock.method(FeeStructure, "exists", () => sessionQuery("structure"));
  t.mock.method(StudentFeeAssignment, "exists", () => sessionQuery("assignment"));
  t.mock.method(FixedAsset, "exists", () => sessionQuery("asset"));
  t.mock.method(FixedAssetDepreciation, "exists", () => sessionQuery("depreciation"));

  assert.equal(await schoolHasFinancialTransactions(SCHOOL_A, session), false);
  assert.deepEqual(new Set(seen), new Set(["assignment", "asset", "depreciation", "payment", "structure", "voucher"]));
  assert.deepEqual(await detectFinancialScaleConflicts(SCHOOL_A, 2, session), []);
  assert.equal(seen.length, 12);
});

test("fee structures alone lock a school currency", async (t) => {
  t.mock.method(FeePayment, "exists", async () => null);
  t.mock.method(FeeVoucher, "exists", async () => null);
  t.mock.method(FixedAsset, "exists", async () => null);
  t.mock.method(FixedAssetDepreciation, "exists", async () => null);
  t.mock.method(StudentFeeAssignment, "exists", async () => null);
  t.mock.method(FeeStructure, "exists", async () => ({ _id: "structure" }));
  assert.equal(await schoolHasFinancialTransactions(SCHOOL_A), true);
});

test("principal can configure currency even without school:update permission", async (t) => {
  assert.equal(hasPermission("principal", "school:update"), false);
  mockTx(t);
  const schoolDoc = {
    _id: SCHOOL_A, baseCurrency: null, currencyConfigurationStatus: "unconfigured",
    save: async function () { return this; }
  };
  t.mock.method(School, "findById", () => ({ session: async () => schoolDoc }));
  for (const Model of [FeePayment, FeeVoucher, FeeStructure, StudentFeeAssignment, FixedAsset, FixedAssetDepreciation]) {
    t.mock.method(Model, "exists", async () => null);
  }
  const result = await configureSchoolCurrency(
    reqFor({ user: { _id: ADMIN_A, schoolId: SCHOOL_A, role: "principal" } }),
    { baseCurrency: "PKR" }
  );
  assert.equal(result.baseCurrency, "PKR");
});

test("blocked consent is a hard deny even when another grant is active", async (t) => {
  t.mock.method(StudentMediaConsent, "find", () => ({ lean: async () => [
    { studentId: STUDENT_A, status: "granted", scope: "all", categories: [] },
    { studentId: STUDENT_A, status: "blocked", scope: "all", categories: [] }
  ] }));
  const result = await evaluateMediaConsent(SCHOOL_A, { studentIds: [STUDENT_A], category: "photo" });
  assert.equal(result.ok, false);
  assert.deepEqual(result.blockedStudentIds.map(String), [STUDENT_A]);
});

test("a teacher who no longer has an assignment cannot reopen media they uploaded", async (t) => {
  t.mock.method(StudentMedia, "findOne", () => ({
    lean: async () => ({
      _id: MEDIA_A, schoolId: SCHOOL_A, studentIds: [STUDENT_A], uploadedBy: TEACHER_A,
      reviewStatus: "approved", publicationStatus: "approved_unpublished", isActive: true,
      category: "photo", title: "Synthetic"
    })
  }));
  t.mock.method(ClassTeacherAssignment, "find", () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(ClassSubject, "find", () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(StudentMediaConsent, "find", () => ({ lean: async () => [
    { studentId: STUDENT_A, status: "granted", scope: "all", categories: [] }
  ] }));
  t.mock.method(StudentMediaAccessLog, "create", async () => ({}));
  await assert.rejects(
    () => getSecureMediaAccess(reqFor({ user: { _id: TEACHER_A, schoolId: SCHOOL_A, role: "teacher" } }), MEDIA_A),
    (error) => error.statusCode === 403
  );
});

test("media access resolves tenant from the session, never from a request-supplied school", async (t) => {
  let captured = null;
  t.mock.method(StudentMedia, "findOne", (query) => {
    captured = query;
    return { lean: async () => null };
  });
  await assert.rejects(
    () => getSecureMediaAccess(reqFor({ user: { _id: ADMIN_A, schoolId: SCHOOL_B, role: "school_admin" }, school: { _id: SCHOOL_B } }), MEDIA_A),
    (error) => error.statusCode === 404
  );
  assert.equal(String(captured.schoolId), SCHOOL_B);
});

test("document uploads reject bytes that do not match the declared type", async (t) => {
  const calls = { upload: 0 };
  const storage = {
    upload: async () => { calls.upload += 1; return { key: "synthetic" }; },
    delete: async () => ({ deleted: true }),
    createDownloadUrl: async () => "https://signed.example/synthetic"
  };
  registerDocumentStorageProvider("s3", storage);
  configureDocumentStorageProvider(storage, "s3");
  await assert.rejects(
    () => createDocument(reqFor(), {
      title: "Synthetic", category: "other", fileName: "spoof.pdf", contentType: "application/pdf",
      dataBase64: Buffer.from("<html><script>alert(1)</script></html>").toString("base64")
    }),
    (error) => error.statusCode === 400 && /does not match/i.test(error.message)
  );
  assert.equal(calls.upload, 0);
  assert.equal(detectFileSignature(Buffer.from("%PDF-1.4 synthetic")), "pdf");
  assert.equal(isDeclaredTypeCompatible("application/pdf", "pdf"), true);
  assert.equal(isDeclaredTypeCompatible("image/png", "pdf"), false);
  assert.equal(isDeclaredTypeCompatible("application/vnd.ms-excel", "ole"), true);
  assert.equal(isDeclaredTypeCompatible("application/vnd.ms-powerpoint", "ole"), true);
});

test("signed URL TTLs are bounded for every provider", () => {
  assert.equal(clampSignedUrlTtl(86400, 900), 3600);
  assert.equal(clampSignedUrlTtl(1, 900), 60);
  assert.equal(clampSignedUrlTtl("invalid", 900), 900);
  assert.equal(clampSignedUrlTtl(undefined, 1234), 1234);
});

test("upload and review limiters use dedicated shared stores", () => {
  const middleware = createRateLimitMiddlewares({ nodeEnv: "test", redisUrl: undefined });
  assert.equal(typeof middleware.uploadLimiter, "function");
  assert.equal(typeof middleware.reviewLimiter, "function");
});

test("quota reporting uses the same validated quota value as enforcement", async (t) => {
  const previous = process.env.STUDENT_MEDIA_APP_QUOTA_BYTES;
  process.env.STUDENT_MEDIA_APP_QUOTA_BYTES = "not-a-number";
  try {
    t.mock.method(StudentMedia, "aggregate", async () => [{ count: 0, totalBytes: 0 }]);
    t.mock.method(StudentMedia, "countDocuments", async () => 0);
    const summary = await getStudentMediaUsageSummary(reqFor());
    assert.equal(summary.quota.appQuotaBytes, 1024 * 1024 * 1024);
    assert.equal(summary.provider.configured, true);
  } finally {
    if (previous === undefined) delete process.env.STUDENT_MEDIA_APP_QUOTA_BYTES;
    else process.env.STUDENT_MEDIA_APP_QUOTA_BYTES = previous;
  }
});

test("transactions-unsupported database errors return an actionable 503", () => {
  const res = {
    headersSent: false,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
  const error = new Error("Transaction numbers are only allowed on a replica set member or mongos");
  errorHandler(error, {}, res, () => {});
  assert.equal(res.code, 503);
  assert.match(res.body.message, /supports transactions/i);
  assert.doesNotMatch(res.body.message, /replica set member|mongos/i);
});
