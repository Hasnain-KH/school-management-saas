// Pure helpers for the teacher student-media direct-upload flow.
// Dependency-free so these can be exercised with `node --test` as well as in the browser.

const MB = 1024 * 1024;

export const LOCAL_MEDIA_LIMITS = Object.freeze({
  photo: 5 * MB,
  video: 25 * MB,
  certificate: 5 * MB,
  project: 10 * MB,
  document: 10 * MB
});

const MEDIA_TYPES = [
  ["photo", "Photos"],
  ["video", "Videos"],
  ["certificate", "Certificates"],
  ["project", "Projects"],
  ["document", "Documents"]
];

const FALLBACK_VIDEO_MAX_SECONDS = 60;
const FORBIDDEN_PROVIDER_HEADERS = new Set(["cookie", "set-cookie", "x-csrf-token", "csrf-token", "x-xsrf-token"]);

const positiveInteger = (value) => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
};

const limitKey = (mediaType) => (Object.hasOwn(LOCAL_MEDIA_LIMITS, mediaType) ? mediaType : "document");

const configuredLimitFor = (mediaType, capabilities) =>
  positiveInteger(capabilities?.effectiveLimits?.[limitKey(mediaType)]) ?? LOCAL_MEDIA_LIMITS[limitKey(mediaType)];

const providerCapFor = (capabilities) => positiveInteger(capabilities?.provider?.maxUploadBytes);

const videoMaxSecondsFor = (capabilities) =>
  positiveInteger(capabilities?.limits?.videoMaxSeconds) ?? FALLBACK_VIDEO_MAX_SECONDS;

export function effectiveLimitFor(mediaType, capabilities) {
  const configured = configuredLimitFor(mediaType, capabilities);
  const providerCap = providerCapFor(capabilities);
  return providerCap === null ? configured : Math.min(configured, providerCap);
}

const formatBytes = (bytes) => {
  if (bytes >= MB) {
    const value = bytes / MB;
    return `${Number.isInteger(value) ? value : value.toFixed(1)} MB`;
  }
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
};

export function formatUploadLimitHint(capabilities) {
  const seconds = videoMaxSecondsFor(capabilities);
  const parts = MEDIA_TYPES.map(([key, label]) => {
    const size = formatBytes(effectiveLimitFor(key, capabilities));
    return key === "video" ? `${label} ${size}/${seconds}s` : `${label} ${size}`;
  });
  const providerCap = providerCapFor(capabilities);
  const constrained = providerCap !== null
    && MEDIA_TYPES.some(([key]) => configuredLimitFor(key, capabilities) > providerCap);
  if (constrained) parts.push(`Provider storage caps a single upload at ${formatBytes(providerCap)}; the smaller limit applies.`);
  return `${parts.join(", ")}.`;
}

export function buildDirectAuthorizePayload(formFields, file, checksumSha256, capabilities) {
  // `capabilities` is accepted for symmetry with the other helpers; the authorize body is fixed by the API contract.
  void capabilities;
  const fields = formFields || {};
  const payload = {
    title: fields.title,
    description: fields.description || "",
    teacherNote: fields.teacherNote || "",
    mediaType: fields.mediaType,
    category: fields.category,
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    byteSize: file.size,
    checksumSha256
  };
  if (fields.eventDate != null && fields.eventDate !== "") payload.eventDate = fields.eventDate;
  if (fields.durationSeconds != null) payload.durationSeconds = fields.durationSeconds;
  // Resubmissions authorize without student fields, so only forward them when supplied.
  if (fields.studentId != null) payload.studentId = fields.studentId;
  if (fields.studentIds != null) payload.studentIds = fields.studentIds;
  return payload;
}

const safeProviderHeaders = (headers) => {
  const safe = {};
  for (const [name, value] of Object.entries(headers || {})) {
    if (value == null || FORBIDDEN_PROVIDER_HEADERS.has(name.toLowerCase())) continue;
    safe[name] = value;
  }
  return safe;
};

export function buildUploadRequest(authorization, file) {
  if (!authorization || typeof authorization !== "object") {
    throw new Error("The upload provider did not return an authorization.");
  }
  if (!authorization.url) throw new Error("The upload provider did not return a destination URL.");

  if (authorization.kind === "presignedPut") {
    return {
      method: "PUT",
      url: authorization.url,
      headers: safeProviderHeaders(authorization.headers),
      body: file,
      credentials: "omit"
    };
  }

  if (authorization.kind === "cloudinarySignedPost") {
    const formData = new FormData();
    for (const [name, value] of Object.entries(authorization.fields || {})) {
      if (value == null) continue;
      formData.append(name, String(value));
    }
    // Providers require the file part to be last so the signed field order stays intact.
    formData.append("file", file);
    return { method: "POST", url: authorization.url, body: formData, credentials: "omit" };
  }

  throw new Error(`Unsupported upload authorization kind: ${authorization.kind}`);
}

export async function sha256Hex(file) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== "function") {
    throw new Error("Secure hashing is unavailable. Open the app over HTTPS (a secure browser context) and retry the upload.");
  }
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("The selected file could not be read for checksum calculation.");
  }
  const digest = await subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
