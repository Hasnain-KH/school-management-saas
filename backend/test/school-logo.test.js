import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret-that-is-long-enough-123";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-that-is-different-456";
process.env.CORS_ORIGINS = "http://localhost:3000";
process.env.MONGO_URI = "mongodb://127.0.0.1:27017/schoolflow-test";

const { default: app } = await import("../src/app.js");
const { default: jwt } = await import("jsonwebtoken");
const { default: mongoose } = await import("mongoose");
const { default: School } = await import("../src/models/school.model.js");
const { default: User } = await import("../src/models/user.model.js");
const { default: RefreshSession } = await import("../src/models/refresh-session.model.js");
const { default: AuditLog } = await import("../src/models/audit-log.model.js");
const { createCsrfToken } = await import("../src/middleware/csrf.middleware.js");
const { configureDocumentStorageProvider, registerDocumentStorageProvider } = await import("../src/services/document-storage.provider.js");
const { detectImageMime, schoolLogoUploadSchema } = await import("../src/validators/school-logo.validator.js");
const { SCHOOL_LOGO_MAX_BYTES, toPublicLogo } = await import("../src/utils/school-logo.js");

const csrfToken = createCsrfToken();
const SCHOOL_A = "64a000000000000000000001";
const SCHOOL_B = "64b000000000000000000002";
const ADMIN_A = "64a000000000000000000003";
const TEACHER_A = "64a000000000000000000004";
const PARENT_A = "64a000000000000000000005";
let tokenCounter = 0;

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1
]);
const html = Buffer.from("<svg onload=alert(1)></svg>");

const makeStorage = () => {
  const objects = new Map();
  const calls = { upload: [], delete: [], download: [] };
  return {
    objects,
    calls,
    upload: async ({ key, body, contentType }) => {
      calls.upload.push({ key, contentType });
      objects.set(key, { body, contentType });
    },
    delete: async ({ key }) => {
      calls.delete.push({ key });
      objects.delete(key);
    },
    createDownloadUrl: async ({ key }) => {
      calls.download.push({ key });
      const object = objects.get(key);
      if (!object) throw new Error("Object does not exist");
      return `data:${object.contentType};base64,${object.body.toString("base64")}`;
    }
  };
};

const setupAuth = (t, { role = "school_admin", userId = ADMIN_A, schoolId = SCHOOL_A, schoolContext = schoolId } = {}) => {
  t.mock.method(RefreshSession, "findOne", async () => ({ userId, schoolId }));
  t.mock.method(User, "findById", async () => ({ _id: userId, schoolId, role, status: "active" }));
  t.mock.method(School, "findById", async () => ({
    _id: schoolContext,
    status: "trial",
    subscription: { status: "trial" }
  }));
  return jwt.sign(
    { tokenType: "access" },
    process.env.JWT_ACCESS_SECRET,
    { subject: userId, jwtid: `logo-test-${++tokenCounter}`, expiresIn: "1m" }
  );
};

const setupPersistence = (t, doc, audits) => {
  t.mock.method(mongoose, "startSession", async () => ({
    withTransaction: async (callback) => callback(),
    endSession: async () => {}
  }));
  t.mock.method(School, "findOne", () => doc);
  t.mock.method(AuditLog.prototype, "save", async function saveAudit() {
    audits.push(this);
    return this;
  });
};

const makeDoc = (logo = null) => {
  const doc = {
    logo,
    save: async () => doc,
    session: async () => doc
  };
  return doc;
};

const unsafe = (token) => ({
  Cookie: `schoolflow_access=${token}; schoolflow_csrf=${csrfToken}`,
  "X-CSRF-Token": csrfToken,
  Origin: "http://localhost:3000"
});

const uploadBody = (overrides = {}) => ({
  fileName: "my logo.png",
  contentType: "image/png",
  dataBase64: png.toString("base64"),
  ...overrides
});

const streamBytes = (response, callback) => {
  const chunks = [];
  response.on("data", (chunk) => chunks.push(chunk));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
  response.on("error", callback);
};

test("logo validators enforce MIME, base64 shape, decoded size and magic bytes", () => {
  assert.equal(detectImageMime(png), "image/png");
  assert.equal(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), "image/jpeg");
  assert.equal(detectImageMime(Buffer.from([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")])), "image/webp");
  assert.equal(detectImageMime(html), null);
  assert.equal(detectImageMime(Buffer.alloc(8)), null);

  assert.equal(schoolLogoUploadSchema.safeParse(uploadBody()).success, true);
  assert.equal(schoolLogoUploadSchema.safeParse(uploadBody({ contentType: "image/svg+xml" })).success, false);
  assert.equal(schoolLogoUploadSchema.safeParse(uploadBody({ schoolId: SCHOOL_B })).success, false);
  assert.equal(schoolLogoUploadSchema.safeParse(uploadBody({ dataBase64: "not base64!!" })).success, false);
  assert.equal(schoolLogoUploadSchema.safeParse(uploadBody({
    dataBase64: Buffer.alloc(SCHOOL_LOGO_MAX_BYTES + 1).toString("base64")
  })).success, false);
  assert.deepEqual(toPublicLogo(null), null);
});

test("a valid upload persists bytes under the authenticated tenant and returns metadata only", async (t) => {
  const token = setupAuth(t);
  const audits = [];
  const doc = makeDoc();
  setupPersistence(t, doc, audits);
  const storage = makeStorage();
  configureDocumentStorageProvider(storage, "s3");

  const response = await request(app)
    .post("/api/v1/schools/me/logo")
    .set(unsafe(token))
    .send(uploadBody({ fileName: "../../logo.png" }))
    .expect(201);

  assert.equal(response.body.success, true);
  const { logo } = response.body.data;
  assert.equal(logo.version, 1);
  assert.equal(logo.contentType, "image/png");
  assert.equal(logo.sizeBytes, png.length);
  assert.equal(logo.fileName, "../../logo.png");
  assert.equal(logo.storageKey, undefined);
  assert.equal(storage.objects.size, 1);
  const [key] = storage.objects.keys();
  assert.match(key, new RegExp(`^logos/${SCHOOL_A}/`));
  assert.equal(doc.logo.storageKey, key);
  assert.equal(doc.logo.storageProvider, "s3");
  assert.deepEqual(storage.objects.get(key).body, png);
  assert.equal(audits[0].action, "school.logo.uploaded");
  assert.equal(audits[0].schoolId.toString(), SCHOOL_A);
});

test("unsupported types, oversized payloads and invalid image bytes are rejected before storage", async (t) => {
  const token = setupAuth(t);
  setupPersistence(t, makeDoc(), []);
  const storage = makeStorage();
  configureDocumentStorageProvider(storage, "s3");

  await request(app).post("/api/v1/schools/me/logo").set(unsafe(token))
    .send(uploadBody({ contentType: "image/svg+xml" })).expect(400);
  await request(app).post("/api/v1/schools/me/logo").set(unsafe(token))
    .send(uploadBody({ dataBase64: Buffer.alloc(SCHOOL_LOGO_MAX_BYTES + 1).toString("base64") })).expect(400);
  await request(app).post("/api/v1/schools/me/logo").set(unsafe(token))
    .send(uploadBody({ dataBase64: html.toString("base64") })).expect(400);

  assert.equal(storage.objects.size, 0);
});

test("replacing a logo increments the version and deletes the previous stored object", async (t) => {
  const token = setupAuth(t);
  const audits = [];
  const oldKey = `logos/${SCHOOL_A}/old.png`;
  const storage = makeStorage();
  storage.objects.set(oldKey, { body: png, contentType: "image/png" });
  configureDocumentStorageProvider(storage, "s3");
  const doc = makeDoc({
    storageKey: oldKey,
    contentType: "image/png",
    sizeBytes: png.length,
    fileName: "old.png",
    version: 1
  });
  setupPersistence(t, doc, audits);

  const response = await request(app)
    .post("/api/v1/schools/me/logo")
    .set(unsafe(token))
    .send(uploadBody({ fileName: "new.png" }))
    .expect(201);

  assert.equal(response.body.data.logo.version, 2);
  assert.equal(storage.objects.has(oldKey), false);
  assert.equal(storage.objects.size, 1);
  assert.equal(doc.logo.fileName, "new.png");
  assert.equal(audits[0].action, "school.logo.uploaded");
});

test("legacy S3-backed logos still resolve while new uploads use the selected Cloudinary adapter", async (t) => {
  const token = setupAuth(t);
  const audits = [];
  const oldKey = `logos/${SCHOOL_A}/old.png`;
  const s3Storage = makeStorage();
  const cloudStorage = makeStorage();
  s3Storage.objects.set(oldKey, { body: png, contentType: "image/png" });
  registerDocumentStorageProvider("s3", s3Storage);
  configureDocumentStorageProvider(cloudStorage, "cloudinary");

  const doc = makeDoc({
    storageKey: oldKey,
    contentType: "image/png",
    sizeBytes: png.length,
    fileName: "old.png",
    version: 1
  });
  setupPersistence(t, doc, audits);

  await request(app)
    .get("/api/v1/schools/me/logo")
    .set("Cookie", `schoolflow_access=${token}`)
    .buffer(true)
    .parse(streamBytes)
    .expect(200);

  assert.equal(s3Storage.calls.download.length, 1);
  assert.equal(cloudStorage.calls.download.length, 0);

  await request(app)
    .post("/api/v1/schools/me/logo")
    .set(unsafe(token))
    .send(uploadBody({ fileName: "new.png" }))
    .expect(201);

  assert.equal(cloudStorage.objects.size, 1);
  assert.equal(doc.logo.storageProvider, "cloudinary");
  assert.equal(s3Storage.objects.has(oldKey), false);
  assert.equal(s3Storage.calls.delete.some((call) => call.key === oldKey), true);
});

test("removing a logo clears metadata, deletes the object and is idempotent", async (t) => {
  const token = setupAuth(t);
  const audits = [];
  const oldKey = `logos/${SCHOOL_A}/old.png`;
  const storage = makeStorage();
  storage.objects.set(oldKey, { body: png, contentType: "image/png" });
  configureDocumentStorageProvider(storage, "s3");
  const doc = makeDoc({
    storageKey: oldKey,
    contentType: "image/png",
    sizeBytes: png.length,
    fileName: "old.png",
    version: 2
  });
  setupPersistence(t, doc, audits);

  const first = await request(app).delete("/api/v1/schools/me/logo").set(unsafe(token)).expect(200);
  assert.equal(first.body.data.removed, true);
  assert.equal(doc.logo, null);
  assert.equal(storage.objects.size, 0);
  assert.equal(audits[0].action, "school.logo.removed");

  const second = await request(app).delete("/api/v1/schools/me/logo").set(unsafe(token)).expect(200);
  assert.equal(second.body.data.removed, false);
});

test("teachers and parents can read the school logo but cannot manage it", async (t) => {
  const storage = makeStorage();
  const key = `logos/${SCHOOL_A}/shared.png`;
  storage.objects.set(key, { body: png, contentType: "image/png" });
  configureDocumentStorageProvider(storage, "s3");
  const doc = makeDoc({
    storageKey: key, contentType: "image/png", sizeBytes: png.length, fileName: "shared.png", version: 3
  });
  setupPersistence(t, doc, []);

  let currentUser = { role: "teacher", userId: TEACHER_A };
  t.mock.method(RefreshSession, "findOne", async () => ({ userId: currentUser.userId, schoolId: SCHOOL_A }));
  t.mock.method(User, "findById", async () => ({
    _id: currentUser.userId, schoolId: SCHOOL_A, role: currentUser.role, status: "active"
  }));
  t.mock.method(School, "findById", async () => ({
    _id: SCHOOL_A, status: "trial", subscription: { status: "trial" }
  }));

  for (const [role, userId] of [["teacher", TEACHER_A], ["parent", PARENT_A]]) {
    currentUser = { role, userId };
    const token = jwt.sign(
      { tokenType: "access" },
      process.env.JWT_ACCESS_SECRET,
      { subject: userId, jwtid: `logo-reader-${role}`, expiresIn: "1m" }
    );
    const response = await request(app)
      .get("/api/v1/schools/me/logo")
      .set("Cookie", `schoolflow_access=${token}`)
      .buffer(true)
      .parse(streamBytes)
      .expect(200);
    assert.equal(response.headers["content-type"], "image/png");
    assert.equal(response.headers["x-logo-version"], "3");
    assert.deepEqual(response.body, png);

    await request(app).post("/api/v1/schools/me/logo").set(unsafe(token)).send(uploadBody()).expect(403);
    await request(app).delete("/api/v1/schools/me/logo").set(unsafe(token)).expect(403);
  }
});

test("the client cannot override tenant identity and cross-tenant contexts are rejected", async (t) => {
  const audits = [];
  const doc = makeDoc();
  setupPersistence(t, doc, audits);
  const storage = makeStorage();
  configureDocumentStorageProvider(storage, "s3");

  let schoolContext = SCHOOL_A;
  t.mock.method(RefreshSession, "findOne", async () => ({ userId: ADMIN_A, schoolId: SCHOOL_A }));
  t.mock.method(User, "findById", async () => ({
    _id: ADMIN_A, schoolId: SCHOOL_A, role: "school_admin", status: "active"
  }));
  t.mock.method(School, "findById", async () => ({
    _id: schoolContext, status: "trial", subscription: { status: "trial" }
  }));
  const token = jwt.sign(
    { tokenType: "access" },
    process.env.JWT_ACCESS_SECRET,
    { subject: ADMIN_A, jwtid: "logo-tenant-admin", expiresIn: "1m" }
  );

  // A strict schema rejects an injected schoolId; even if ignored, the service
  // derives the key only from req.user.schoolId.
  const injected = await request(app)
    .post("/api/v1/schools/me/logo")
    .set(unsafe(token))
    .send(uploadBody({ schoolId: SCHOOL_B }))
    .expect(400);
  assert.equal(injected.body.success, false);
  assert.equal(storage.objects.size, 0);
  assert.equal(audits.length, 0);

  // An authenticated identity for school A cannot read through a context that
  // resolves to school B. The query string is never treated as authority.
  schoolContext = SCHOOL_B;
  await request(app)
    .get(`/api/v1/schools/me/logo?schoolId=${SCHOOL_B}`)
    .set("Cookie", `schoolflow_access=${token}`)
    .expect(403);
});

test("a tenant with no logo gets a 404 and public identity never exposes a storage key", async (t) => {
  const token = setupAuth(t);
  setupPersistence(t, makeDoc(), []);
  configureDocumentStorageProvider(makeStorage(), "s3");

  await request(app)
    .get("/api/v1/schools/me/logo")
    .set("Cookie", `schoolflow_access=${token}`)
    .expect(404);

  const identity = await request(app)
    .get("/api/v1/auth/me")
    .set("Cookie", `schoolflow_access=${token}`)
    .expect(200);
  assert.equal(identity.body.data.school.logo, null);
  assert.equal(JSON.stringify(identity.body).includes("storageKey"), false);
});
