import assert from "node:assert/strict";
import test from "node:test";
import {
  SCHOOL_LOGO_ACCEPT,
  SCHOOL_LOGO_FORMAT_LABEL,
  SCHOOL_LOGO_MAX_BYTES,
  readLogoHeader,
  validateSchoolLogoFile
} from "../src/utils/school-logo.js";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1]);
const WEBP = Uint8Array.from([
  ...new TextEncoder().encode("RIFF"), 0, 0, 0, 0,
  ...new TextEncoder().encode("WEBP"), 0, 0, 0, 0
]);
const HTML = new TextEncoder().encode("<svg onload=alert(1)>");

const fakeFile = (type, size, bytes) => ({
  type,
  size,
  slice: (start, end) => ({ arrayBuffer: async () => bytes.slice(start, end).buffer })
});

test("logo picker advertises only PNG, JPG and WebP with a 2 MB limit", () => {
  assert.equal(SCHOOL_LOGO_MAX_BYTES, 2 * 1024 * 1024);
  assert.equal(SCHOOL_LOGO_ACCEPT, "image/png,image/jpeg,image/webp");
  assert.match(SCHOOL_LOGO_FORMAT_LABEL, /PNG, JPG, JPEG or WebP/);
  assert.match(SCHOOL_LOGO_FORMAT_LABEL, /2 MB/);
});

test("valid PNG, JPEG and WebP files pass validation when bytes match the declared type", () => {
  assert.equal(validateSchoolLogoFile(fakeFile("image/png", PNG.length, PNG), PNG).ok, true);
  assert.equal(validateSchoolLogoFile(fakeFile("image/jpeg", JPEG.length, JPEG), JPEG).ok, true);
  assert.equal(validateSchoolLogoFile(fakeFile("image/webp", WEBP.length, WEBP), WEBP).ok, true);
  assert.equal(validateSchoolLogoFile(fakeFile("image/png", PNG.length, PNG), PNG).contentType, "image/png");
  assert.equal(validateSchoolLogoFile(fakeFile("image/jpeg", JPEG.length, JPEG), JPEG).contentType, "image/jpeg");
});

test("unsupported declared types are rejected before upload", () => {
  for (const type of ["image/svg+xml", "image/gif", "text/html", "application/pdf", ""]) {
    const result = validateSchoolLogoFile(fakeFile(type, HTML.length, HTML), HTML);
    assert.equal(result.ok, false, type);
    assert.match(result.error, /Unsupported format/);
  }
});

test("oversized and empty files are rejected", () => {
  const oversized = validateSchoolLogoFile(fakeFile("image/png", SCHOOL_LOGO_MAX_BYTES + 1, PNG), PNG);
  assert.equal(oversized.ok, false);
  assert.match(oversized.error, /larger than 2 MB/);
  assert.equal(validateSchoolLogoFile(fakeFile("image/png", 0, PNG), PNG).ok, false);
  assert.equal(validateSchoolLogoFile(null, PNG).ok, false);
});

test("renamed script/HTML content and mismatched headers are rejected", () => {
  const renamed = validateSchoolLogoFile(fakeFile("image/png", HTML.length, HTML), HTML);
  assert.equal(renamed.ok, false);
  assert.match(renamed.error, /content does not match/);

  const mismatch = validateSchoolLogoFile(fakeFile("image/png", PNG.length, PNG), JPEG);
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.error, /content does not match/);
});

test("readLogoHeader reads only the leading bytes used for magic-byte detection", async () => {
  const file = fakeFile("image/png", 1024, PNG);
  const header = await readLogoHeader(file);
  assert.equal(header.length, PNG.length);
  assert.deepEqual(Array.from(header), Array.from(PNG));
  assert.equal(await readLogoHeader(null), null);
});
