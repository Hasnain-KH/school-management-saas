import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDirectAuthorizePayload,
  buildUploadRequest,
  effectiveLimitFor,
  formatUploadLimitHint,
  sha256Hex
} from "../src/utils/student-media-upload.js";

const MB = 1024 * 1024;

const capabilitiesFixture = () => ({
  directUploadSupported: true,
  provider: {
    configured: true, providerName: "cloudinary", directUpload: true, objectLookup: true,
    objectRead: true, maxUploadBytes: 3 * MB, uploadAuthTtlSeconds: 300
  },
  effectiveLimits: { photo: 5 * MB, video: 25 * MB, certificate: 5 * MB, project: 10 * MB, document: 10 * MB },
  limits: { videoMaxSeconds: 60, teacherDailyUploadLimit: 50, maxAffectedStudents: 30 }
});

const assertNoAppCredentials = (value) => {
  const serialized = JSON.stringify(value, (key, item) => (key === "body" && item && item.constructor?.name === "FormData" ? undefined : item));
  assert.equal(serialized.toLowerCase().includes("cookie"), false);
  assert.equal(serialized.toLowerCase().includes("csrf"), false);
};

test("effectiveLimitFor falls back to local limits when capabilities are missing or empty", () => {
  assert.equal(effectiveLimitFor("photo"), 5 * MB);
  assert.equal(effectiveLimitFor("video", null), 25 * MB);
  assert.equal(effectiveLimitFor("certificate", {}), 5 * MB);
  assert.equal(effectiveLimitFor("project", { effectiveLimits: {} }), 10 * MB);
  assert.equal(effectiveLimitFor("document", { effectiveLimits: {} }), 10 * MB);
  assert.equal(effectiveLimitFor("unknown-type"), 10 * MB);
});

test("effectiveLimitFor honors configured limits and a lower provider cap", () => {
  const capabilities = capabilitiesFixture();
  assert.equal(effectiveLimitFor("video", capabilities), 3 * MB, "provider cap must constrain a larger app limit");
  assert.equal(effectiveLimitFor("photo", capabilities), 3 * MB);

  capabilities.provider.maxUploadBytes = 100 * MB;
  assert.equal(effectiveLimitFor("video", capabilities), 25 * MB);
  capabilities.effectiveLimits.photo = 2 * MB;
  assert.equal(effectiveLimitFor("photo", capabilities), 2 * MB, "a smaller backend limit wins");
  assert.equal(effectiveLimitFor("certificate", capabilities), 5 * MB);

  const garbage = { effectiveLimits: { photo: "not-a-number", video: -1 }, provider: { maxUploadBytes: Infinity } };
  assert.equal(effectiveLimitFor("photo", garbage), 5 * MB);
  assert.equal(effectiveLimitFor("video", garbage), 25 * MB);
});

test("formatUploadLimitHint reflects limits, video seconds, and a lower provider cap", () => {
  const withCap = formatUploadLimitHint(capabilitiesFixture());
  assert.match(withCap, /Photos 3 MB/);
  assert.match(withCap, /Videos 3 MB\/60s/);
  assert.match(withCap, /Certificates 3 MB/);
  assert.match(withCap, /provider/i);
  assert.match(withCap, /3 MB/);

  const withoutCap = formatUploadLimitHint(null);
  assert.match(withoutCap, /Photos 5 MB/);
  assert.match(withoutCap, /Videos 25 MB\/60s/);
  assert.match(withoutCap, /Documents 10 MB/);
  assert.doesNotMatch(withoutCap, /provider/i);

  const longerVideos = capabilitiesFixture();
  longerVideos.provider.maxUploadBytes = 100 * MB;
  longerVideos.limits.videoMaxSeconds = 120;
  const hint = formatUploadLimitHint(longerVideos);
  assert.match(hint, /Videos 25 MB\/120s/);
  assert.doesNotMatch(hint, /provider/i);
});

test("buildDirectAuthorizePayload maps exact authorize fields and preserves student fields", () => {
  const file = { name: "clip.mp4", type: "video/mp4", size: 12345 };
  const payload = buildDirectAuthorizePayload({
    title: "Sports day", description: "Final", teacherNote: "Check consent",
    mediaType: "video", category: "school_event", eventDate: "2026-11-20",
    durationSeconds: 42, studentId: "student-1", studentIds: ["student-1", "student-2"],
    dataBase64: "huge-unused-value", unexpected: "ignored"
  }, file, "checksum-abc", capabilitiesFixture());

  assert.deepEqual(payload, {
    title: "Sports day", description: "Final", teacherNote: "Check consent",
    mediaType: "video", category: "school_event", eventDate: "2026-11-20",
    fileName: "clip.mp4", contentType: "video/mp4", byteSize: 12345,
    checksumSha256: "checksum-abc", durationSeconds: 42,
    studentId: "student-1", studentIds: ["student-1", "student-2"]
  });
});

test("buildDirectAuthorizePayload omits student fields for resubmissions", () => {
  const file = { name: "photo.jpg", type: "", size: 10 };
  const payload = buildDirectAuthorizePayload(
    { title: "Retake", mediaType: "photo", category: "photo" }, file, "sum", null
  );
  assert.equal(payload.contentType, "application/octet-stream");
  assert.equal("studentId" in payload, false);
  assert.equal("studentIds" in payload, false);
  assert.equal("durationSeconds" in payload, false);
  assert.equal("eventDate" in payload, false);
});

test("buildUploadRequest builds a credential-free presigned PUT", () => {
  const file = { name: "photo.jpg", size: 12 };
  const request = buildUploadRequest({
    kind: "presignedPut", method: "PUT", url: "https://storage.example.com/upload",
    headers: { "Content-Type": "image/jpeg", "x-amz-meta-school": "demo" }
  }, file);

  assert.deepEqual(request, {
    method: "PUT", url: "https://storage.example.com/upload",
    headers: { "Content-Type": "image/jpeg", "x-amz-meta-school": "demo" },
    body: file, credentials: "omit"
  });
  assertNoAppCredentials(request);
});

test("buildUploadRequest strips cookies and CSRF headers from provider requests", () => {
  const request = buildUploadRequest({
    kind: "presignedPut", url: "https://storage.example.com/upload",
    headers: { Cookie: "session=secret", "X-CSRF-Token": "secret", "Content-Type": "image/jpeg" }
  }, { name: "photo.jpg", size: 1 });
  assert.deepEqual(request.headers, { "Content-Type": "image/jpeg" });
  assertNoAppCredentials(request);
});

test("buildUploadRequest appends Cloudinary fields before the file", {
  skip: typeof FormData === "undefined" ? "FormData is not available in this runtime" : false
}, () => {
  const file = typeof File === "function"
    ? new File(["photo"], "photo.jpg", { type: "image/jpeg" })
    : new Blob(["photo"]);
  const request = buildUploadRequest({
    kind: "cloudinarySignedPost", method: "POST",
    url: "https://api.cloudinary.com/v1_1/demo/image/upload",
    fields: { api_key: "123", signature: "signed", timestamp: 1700000000, folder: "school" },
    headers: { Cookie: "session=secret" }
  }, file);

  assert.equal(request.method, "POST");
  assert.equal(request.url, "https://api.cloudinary.com/v1_1/demo/image/upload");
  assert.equal(request.credentials, "omit");
  assert.equal("headers" in request, false);
  assert.deepEqual([...request.body.keys()], ["api_key", "signature", "timestamp", "folder", "file"]);
  assert.equal(request.body.get("api_key"), "123");
  assert.equal(request.body.get("timestamp"), "1700000000");
  assert.ok(request.body.get("file"));
  assertNoAppCredentials(request);
});

test("buildUploadRequest rejects unsupported authorization kinds", () => {
  assert.throws(() => buildUploadRequest({ kind: "unknown", url: "https://storage.example.com" }, {}), /Unsupported upload authorization/);
  assert.throws(() => buildUploadRequest(null, {}), /did not return an authorization/);
});

test("sha256Hex hashes the file bytes with Web Crypto", {
  skip: !globalThis.crypto?.subtle ? "Web Crypto is not available in this runtime" : false
}, async () => {
  const fakeFile = { arrayBuffer: async () => new TextEncoder().encode("abc").buffer };
  assert.equal(await sha256Hex(fakeFile), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("sha256Hex reports a clear error when crypto.subtle is unavailable", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
    await assert.rejects(
      sha256Hex({ arrayBuffer: async () => new ArrayBuffer(0) }),
      /Secure hashing is unavailable/
    );
  } finally {
    if (original) Object.defineProperty(globalThis, "crypto", original);
    else delete globalThis.crypto;
  }
});
