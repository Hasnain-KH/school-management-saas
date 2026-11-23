import assert from "node:assert/strict";
import test from "node:test";
import createStudentMediaRoutes from "../src/routes/student-media.routes.js";
import {
  studentMediaDirectFinalizeSchema,
  studentMediaDirectResubmitAuthorizeSchema,
  studentMediaDirectUploadAuthorizeSchema
} from "../src/validators/student-media.validator.js";

test("student media routes require injected shared limiters", () => {
  assert.throws(() => createStudentMediaRoutes(), /require shared upload and review limiters/i);
  assert.throws(
    () => createStudentMediaRoutes({ uploadLimiter: () => {} }),
    /require shared upload and review limiters/i
  );
  assert.doesNotThrow(() => createStudentMediaRoutes({
    uploadLimiter: () => {},
    reviewLimiter: () => {}
  }));
});

const registeredRoutes = (router) => router.stack
  .filter((layer) => layer.route)
  .map((layer) => ({
    method: Object.keys(layer.route.methods)[0],
    path: layer.route.path,
    handlers: layer.route.stack.map((routeLayer) => routeLayer.handle.name)
  }));

const withNamedLimiters = () => {
  function sharedUploadLimiter(_req, _res, next) { next(); }
  function sharedReviewLimiter(_req, _res, next) { next(); }
  return {
    uploadLimiter: sharedUploadLimiter,
    reviewLimiter: sharedReviewLimiter,
    router: createStudentMediaRoutes({ uploadLimiter: sharedUploadLimiter, reviewLimiter: sharedReviewLimiter })
  };
};

test("direct upload routes are registered before the resubmit route with the shared upload limiter", () => {
  const { router } = withNamedLimiters();
  const routes = registeredRoutes(router);
  const routeFor = (method, path) => routes.find((route) => route.method === method && route.path === path);
  const indexOf = (method, path) => routes.findIndex((route) => route.method === method && route.path === path);

  const capabilities = routeFor("get", "/teacher/capabilities");
  assert.ok(capabilities, "GET /teacher/capabilities must exist");
  assert.ok(!capabilities.handlers.includes("sharedUploadLimiter"), "capabilities is a read, not an upload");

  for (const path of ["/teacher/upload-authorize", "/teacher/upload-finalize"]) {
    const route = routeFor("post", path);
    assert.ok(route, `POST ${path} must exist`);
    assert.ok(route.handlers.includes("sharedUploadLimiter"), `${path} must use the shared upload limiter`);
    assert.ok(!route.handlers.includes("sharedReviewLimiter"), `${path} must not use the review limiter`);
    assert.ok(indexOf("post", path) < indexOf("post", "/teacher/:id/resubmit"), `${path} must precede resubmit`);
  }

  for (const path of ["/teacher/:id/resubmit-authorize", "/teacher/:id/resubmit-finalize"]) {
    const route = routeFor("post", path);
    assert.ok(route, `POST ${path} must exist`);
    assert.ok(route.handlers.includes("sharedUploadLimiter"), `${path} must use the shared upload limiter`);
    assert.ok(!route.handlers.includes("sharedReviewLimiter"), `${path} must not use the review limiter`);
    assert.ok(indexOf("post", path) < indexOf("post", "/teacher/:id/resubmit"), `${path} must precede resubmit`);
  }

  const resubmit = routeFor("post", "/teacher/:id/resubmit");
  assert.ok(resubmit?.handlers.includes("sharedUploadLimiter"), "existing resubmit keeps the upload limiter");
  assert.ok(routeFor("post", "/admin/:id/approve")?.handlers.includes("sharedReviewLimiter"), "review routes keep the review limiter");
});

test("student media routes fail closed when either shared limiter is missing", () => {
  const { uploadLimiter, reviewLimiter } = withNamedLimiters();
  assert.throws(
    () => createStudentMediaRoutes({ reviewLimiter }),
    /require shared upload and review limiters/i
  );
  assert.throws(
    () => createStudentMediaRoutes({ uploadLimiter }),
    /require shared upload and review limiters/i
  );
});

const validDirectUploadPayload = () => ({
  title: "Class picnic photo",
  description: "",
  teacherNote: "Checked by teacher",
  mediaType: "photo",
  category: "school_event",
  eventDate: "2026-05-14",
  fileName: "picnic.jpg",
  contentType: "image/jpeg",
  byteSize: 2048,
  checksumSha256: "a".repeat(64),
  studentId: "507f1f77bcf86cd799439011",
  studentIds: ["507f1f77bcf86cd799439012"]
});

test("direct upload authorize schema accepts a valid payload", () => {
  const result = studentMediaDirectUploadAuthorizeSchema.safeParse(validDirectUploadPayload());
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.description, "");
    assert.equal(result.data.teacherNote, "Checked by teacher");
    assert.equal(result.data.byteSize, 2048);
  }

  const { studentId: _studentId, studentIds: _studentIds, ...resubmitPayload } = validDirectUploadPayload();
  assert.equal(studentMediaDirectResubmitAuthorizeSchema.safeParse(resubmitPayload).success, true);
  assert.equal(studentMediaDirectResubmitAuthorizeSchema.safeParse(validDirectUploadPayload()).success, false);
});

test("direct upload authorize schema requires a sha-256 checksum", () => {
  const { checksumSha256: _checksum, ...withoutChecksum } = validDirectUploadPayload();
  assert.equal(studentMediaDirectUploadAuthorizeSchema.safeParse(withoutChecksum).success, false);
  assert.equal(
    studentMediaDirectUploadAuthorizeSchema.safeParse({ ...validDirectUploadPayload(), checksumSha256: "not-a-checksum" }).success,
    false
  );
});

test("direct upload authorize schema requires a positive video duration of at most 60 seconds", () => {
  const videoPayload = {
    ...validDirectUploadPayload(),
    mediaType: "video",
    category: "video",
    durationSeconds: undefined
  };
  assert.equal(studentMediaDirectUploadAuthorizeSchema.safeParse(videoPayload).success, false);
  assert.equal(studentMediaDirectUploadAuthorizeSchema.safeParse({ ...videoPayload, durationSeconds: 0 }).success, false);
  assert.equal(studentMediaDirectUploadAuthorizeSchema.safeParse({ ...videoPayload, durationSeconds: 61 }).success, false);
  assert.equal(studentMediaDirectUploadAuthorizeSchema.safeParse({ ...videoPayload, durationSeconds: 60 }).success, true);
});

test("direct finalize schema requires a UUID upload id", () => {
  assert.equal(studentMediaDirectFinalizeSchema.safeParse({ uploadId: "not-a-uuid" }).success, false);
  assert.equal(
    studentMediaDirectFinalizeSchema.safeParse({ uploadId: "9f4f1c2e-8a5b-4c6d-9e0f-1a2b3c4d5e6f" }).success,
    true
  );
  assert.equal(
    studentMediaDirectFinalizeSchema.safeParse({ uploadId: "9f4f1c2e-8a5b-4c6d-9e0f-1a2b3c4d5e6f", durationSeconds: 42 }).success,
    true
  );
  assert.equal(
    studentMediaDirectFinalizeSchema.safeParse({ uploadId: "9f4f1c2e-8a5b-4c6d-9e0f-1a2b3c4d5e6f", unexpected: true }).success,
    false
  );
});
