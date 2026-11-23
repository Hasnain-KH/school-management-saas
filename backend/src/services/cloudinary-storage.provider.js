import { v2 as cloudinary } from "cloudinary";
import { HttpError } from "../utils/http-error.js";
import { clampSignedUrlTtl } from "../utils/signed-url-ttl.js";

// SchoolFlow stores every asset as an authenticated Cloudinary `raw` file.
// Raw delivery preserves the original bytes and avoids Cloudinary image
// transformations changing a document or logo that has a stored sha256 checksum.
export const CLOUDINARY_RESOURCE_TYPE = "raw";
export const CLOUDINARY_DELIVERY_TYPE = "authenticated";
export const CLOUDINARY_DEFAULT_FOLDER = "schoolflow";
export const CLOUDINARY_DEFAULT_URL_TTL_SECONDS = 900;
const CLOUDINARY_REQUEST_TIMEOUT_MS = 10000;

const CONTENT_TYPE_FORMATS = new Map([
    ["application/pdf", "pdf"],
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["application/msword", "doc"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
    ["application/vnd.ms-excel", "xls"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"]
]);

// Only these categories are ever exposed to callers. Classification reads a
// fixed allowlist of numeric status fields and string codes; error messages,
// response bodies, URLs and credentials are never inspected or forwarded.
export const CLOUDINARY_ERROR_CATEGORIES = Object.freeze({
    AUTH: "AUTH",
    INVALID_CONFIG: "INVALID_CONFIG",
    NETWORK: "NETWORK",
    RATE_LIMIT: "RATE_LIMIT",
    SERVER_ERROR: "SERVER_ERROR",
    UNKNOWN: "UNKNOWN"
});

const STATUS_CATEGORIES = new Map([
    [400, CLOUDINARY_ERROR_CATEGORIES.INVALID_CONFIG],
    [401, CLOUDINARY_ERROR_CATEGORIES.AUTH],
    [403, CLOUDINARY_ERROR_CATEGORIES.AUTH],
    [404, CLOUDINARY_ERROR_CATEGORIES.INVALID_CONFIG],
    [408, CLOUDINARY_ERROR_CATEGORIES.NETWORK],
    [429, CLOUDINARY_ERROR_CATEGORIES.RATE_LIMIT],
    [500, CLOUDINARY_ERROR_CATEGORIES.SERVER_ERROR],
    [502, CLOUDINARY_ERROR_CATEGORIES.SERVER_ERROR],
    [503, CLOUDINARY_ERROR_CATEGORIES.SERVER_ERROR],
    [504, CLOUDINARY_ERROR_CATEGORIES.NETWORK]
]);

const CODE_CATEGORIES = new Map([
    ["ECONNREFUSED", CLOUDINARY_ERROR_CATEGORIES.NETWORK],
    ["ECONNRESET", CLOUDINARY_ERROR_CATEGORIES.NETWORK],
    ["ENOTFOUND", CLOUDINARY_ERROR_CATEGORIES.NETWORK],
    ["EAI_AGAIN", CLOUDINARY_ERROR_CATEGORIES.NETWORK],
    ["ETIMEDOUT", CLOUDINARY_ERROR_CATEGORIES.NETWORK],
    ["EPIPE", CLOUDINARY_ERROR_CATEGORIES.NETWORK],
    ["UND_ERR_CONNECT_TIMEOUT", CLOUDINARY_ERROR_CATEGORIES.NETWORK],
    ["UND_ERR_SOCKET", CLOUDINARY_ERROR_CATEGORIES.NETWORK]
]);

const NUMERIC_STATUS_FIELDS = ["http_code", "statusCode", "status"];

const classifyCloudinaryError = (error) => {
    if (!error || typeof error !== "object") return CLOUDINARY_ERROR_CATEGORIES.UNKNOWN;
    // Cloudinary API errors nest the numeric code under `error`; Node transport
    // errors put a string code at the top level. Both paths are allowlisted.
    for (const candidate of [error, error.error]) {
        if (!candidate || typeof candidate !== "object") continue;
        for (const field of NUMERIC_STATUS_FIELDS) {
            const category = STATUS_CATEGORIES.get(Number(candidate[field]));
            if (category) return category;
        }
        const code = candidate.code;
        const codeStatusCategory = STATUS_CATEGORIES.get(Number(code));
        if (codeStatusCategory) return codeStatusCategory;
        const codeCategory = CODE_CATEGORIES.get(code);
        if (codeCategory) return codeCategory;
    }
    return CLOUDINARY_ERROR_CATEGORIES.UNKNOWN;
};

// A missing asset is reported either as a 404 on an allowlisted numeric field
// or as a plain "not found" result. Messages and response bodies are never
// inspected, so a credential embedded in them cannot be forwarded.
const isCloudinaryNotFound = (error) => {
    if (!error || typeof error !== "object") return false;
    for (const candidate of [error, error.error]) {
        if (!candidate || typeof candidate !== "object") continue;
        for (const field of NUMERIC_STATUS_FIELDS) {
            if (Number(candidate[field]) === 404) return true;
        }
        if (Number(candidate.code) === 404) return true;
    }
    return false;
};

const storageError = (message, code, category = CLOUDINARY_ERROR_CATEGORIES.UNKNOWN) => {
    const error = new HttpError(502, message);
    error.code = code;
    error.category = category;
    return error;
};

const safeSegment = (segment) => String(segment).replace(/[^A-Za-z0-9._-]+/g, "_");

const normalizePath = (value, label) => {
    if (typeof value !== "string" || !value.trim()) {
        throw new TypeError(`${label} must be a non-empty string`);
    }
    return value.trim()
        .replace(/\\/g, "/")
        .split("/")
        .filter(Boolean)
        .map(safeSegment)
        .join("/");
};

// Keys are generated server-side as `logos/<schoolId>/...` or
// `<schoolId>/<category>/...`, so prefixing with the configured folder keeps a
// deterministic, school-specific public ID for every tenant asset.
export const toCloudinaryPublicId = (key, folder = CLOUDINARY_DEFAULT_FOLDER) => {
    const normalizedKey = normalizePath(key, "Storage key");
    const normalizedFolder = folder ? normalizePath(folder, "Cloudinary folder") : "";
    return normalizedFolder ? `${normalizedFolder}/${normalizedKey}` : normalizedKey;
};

const formatFromContentType = (contentType) =>
    CONTENT_TYPE_FORMATS.get(String(contentType ?? "").toLowerCase()) ?? null;

const formatFromKey = (key) => {
    const fileName = String(key).split("/").pop() ?? "";
    const dot = fileName.lastIndexOf(".");
    if (dot <= 0 || dot === fileName.length - 1) return null;
    const extension = fileName.slice(dot + 1).toLowerCase();
    return /^[a-z0-9]{1,8}$/.test(extension) ? extension : null;
};

export const createCloudinaryStorage = ({
    cloudName,
    apiKey,
    apiSecret,
    folder = CLOUDINARY_DEFAULT_FOLDER,
    secure = true,
    urlExpirySeconds = CLOUDINARY_DEFAULT_URL_TTL_SECONDS,
    client = cloudinary,
    fetchImpl = fetch
} = {}) => {
    if (!cloudName || !apiKey || !apiSecret) {
        throw new TypeError("Cloudinary storage requires cloudName, apiKey, and apiSecret");
    }
    if (!client
        || typeof client.config !== "function"
        || typeof client.uploader?.upload !== "function"
        || typeof client.uploader?.destroy !== "function"
        || typeof client.utils?.private_download_url !== "function"
        || typeof client.utils?.api_sign_request !== "function"
        || typeof client.api?.resource !== "function") {
        throw new TypeError("Cloudinary client must provide config, uploader.upload, uploader.destroy, utils.private_download_url, utils.api_sign_request, and api.resource");
    }

    client.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure });

    const ttl = clampSignedUrlTtl(urlExpirySeconds, CLOUDINARY_DEFAULT_URL_TTL_SECONDS);

    const upload = async ({ key, body, contentType = "application/octet-stream" }) => {
        const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
        const publicId = toCloudinaryPublicId(key, folder);
        const dataUri = `data:${contentType};base64,${payload.toString("base64")}`;

        let result;
        try {
            result = await client.uploader.upload(dataUri, {
                public_id: publicId,
                resource_type: CLOUDINARY_RESOURCE_TYPE,
                type: CLOUDINARY_DELIVERY_TYPE,
                overwrite: false,
                context: `storage_key=${publicId}`,
                tags: [CLOUDINARY_DEFAULT_FOLDER],
                timeout: CLOUDINARY_REQUEST_TIMEOUT_MS
            });
        } catch (cause) {
            throw storageError(
                "The document storage provider rejected the upload",
                "CLOUDINARY_UPLOAD_FAILED",
                classifyCloudinaryError(cause)
            );
        }

        if (!result || typeof result.public_id !== "string") {
            throw storageError("The document storage provider returned an invalid upload response", "CLOUDINARY_UPLOAD_INVALID");
        }
        return { key, publicId: result.public_id };
    };

    const remove = async ({ key }) => {
        const publicId = toCloudinaryPublicId(key, folder);

        let result;
        try {
            result = await client.uploader.destroy(publicId, {
                resource_type: CLOUDINARY_RESOURCE_TYPE,
                type: CLOUDINARY_DELIVERY_TYPE,
                invalidate: true,
                timeout: CLOUDINARY_REQUEST_TIMEOUT_MS
            });
        } catch (cause) {
            throw storageError(
                "The document storage provider rejected the deletion",
                "CLOUDINARY_DELETE_FAILED",
                classifyCloudinaryError(cause)
            );
        }

        // Cloudinary reports a missing asset as `not found`; the S3 adapter also
        // treats a 404 delete as success, so preserve that behavior here.
        if (result && String(result.result) === "error") {
            throw storageError("The document storage provider rejected the deletion", "CLOUDINARY_DELETE_FAILED");
        }
        return { deleted: true };
    };

    // Authenticated assets require the SDK's private_download_url helper. The
    // plain url() helper would append `.<format>` to a raw public ID that
    // already carries its extension, and it ignores `expires_at`.
    const createDownloadUrl = async ({ key, expiresIn = ttl, contentType } = {}) => {
        const publicId = toCloudinaryPublicId(key, folder);
        const seconds = clampSignedUrlTtl(expiresIn, ttl);
        const format = formatFromContentType(contentType) ?? formatFromKey(key) ?? "bin";
        const options = {
            resource_type: CLOUDINARY_RESOURCE_TYPE,
            type: CLOUDINARY_DELIVERY_TYPE,
            expires_at: Math.floor(Date.now() / 1000) + seconds
        };

        try {
            return client.utils.private_download_url(publicId, format, options);
        } catch (cause) {
            throw storageError(
                "The document storage provider rejected the download URL",
                "CLOUDINARY_DOWNLOAD_URL_FAILED",
                classifyCloudinaryError(cause)
            );
        }
    };

    // Cloudinary accepts a server-signed POST for direct uploads. Only the
    // server-generated public ID and fixed asset settings are signed; the
    // secret is used locally to compute the signature and never leaves here.
    const createUploadAuthorization = ({ key, contentType = "application/octet-stream", expiresInSeconds = 300 } = {}) => {
        const publicId = toCloudinaryPublicId(key, folder);
        const seconds = Math.min(300, clampSignedUrlTtl(expiresInSeconds, 300));
        const timestamp = Math.floor(Date.now() / 1000);
        const params = {
            public_id: publicId,
            resource_type: CLOUDINARY_RESOURCE_TYPE,
            type: CLOUDINARY_DELIVERY_TYPE,
            overwrite: "false",
            context: `storage_key=${publicId}`,
            tags: [CLOUDINARY_DEFAULT_FOLDER],
            timestamp
        };
        const signature = client.utils.api_sign_request(params, apiSecret);
        const protocol = secure ? "https" : "http";

        return {
            kind: "cloudinarySignedPost",
            method: "POST",
            url: `${protocol}://api.cloudinary.com/v1_1/${cloudName}/${CLOUDINARY_RESOURCE_TYPE}/upload`,
            fields: { ...params, api_key: apiKey, signature },
            key,
            contentType,
            expiresInSeconds: seconds,
            expiresAt: new Date((timestamp + seconds) * 1000).toISOString()
        };
    };

    const getObjectMetadata = async ({ key } = {}) => {
        const publicId = toCloudinaryPublicId(key, folder);
        let result;
        try {
            result = await client.api.resource(publicId, {
                resource_type: CLOUDINARY_RESOURCE_TYPE,
                type: CLOUDINARY_DELIVERY_TYPE
            });
        } catch (cause) {
            if (isCloudinaryNotFound(cause)) return null;
            throw storageError(
                "The document storage provider rejected the object lookup",
                "CLOUDINARY_OBJECT_LOOKUP_FAILED",
                classifyCloudinaryError(cause)
            );
        }

        if (result === "not found" || result?.result === "not found") return null;
        if (!result || typeof result !== "object" || result.public_id !== publicId) {
            throw storageError("The document storage provider returned an invalid object lookup response", "CLOUDINARY_OBJECT_LOOKUP_INVALID");
        }

        return {
            key,
            publicId: result.public_id,
            sizeBytes: Number(result.bytes) || null,
            contentType: result.format || null,
            etag: result.etag || null,
            durationSeconds: Number.isFinite(Number(result.duration)) ? Number(result.duration) : null,
            lastModified: result.created_at || null
        };
    };

    const readObjectBytes = async ({ key, maxBytes } = {}) => {
        const url = await createDownloadUrl({ key, expiresIn: 60 });
        let response;
        try {
            response = await fetchImpl(url, { signal: AbortSignal.timeout(CLOUDINARY_REQUEST_TIMEOUT_MS) });
        } catch (cause) {
            throw storageError(
                "The document storage provider rejected the object read",
                "CLOUDINARY_OBJECT_READ_FAILED",
                classifyCloudinaryError(cause)
            );
        }
        if (response.status === 404) return null;
        if (!response.ok) {
            throw storageError(
                "The document storage provider rejected the object read",
                "CLOUDINARY_OBJECT_READ_FAILED",
                STATUS_CATEGORIES.get(response.status) ?? CLOUDINARY_ERROR_CATEGORIES.UNKNOWN
            );
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (Number.isFinite(maxBytes) && buffer.length > maxBytes + 1) {
            const error = new HttpError(400, "The uploaded object exceeds the provider-compatible size limit");
            error.code = "STORAGE_OBJECT_TOO_LARGE";
            throw error;
        }
        return buffer;
    };

    // 10 MB is a deliberately conservative ceiling for raw files on a Free
    // Cloudinary plan; whether a given live account allows more is unverified.
    const getCapabilities = () => ({
        directUpload: "cloudinarySignedPost",
        objectLookup: true,
        objectRead: true,
        maxUploadBytes: 10 * 1024 * 1024,
        uploadAuthTtlSeconds: 300
    });

    return {
        upload,
        delete: remove,
        createDownloadUrl,
        createUploadAuthorization,
        getObjectMetadata,
        readObjectBytes,
        getCapabilities
    };
};
