import { v2 as cloudinary } from "cloudinary";
import { HttpError } from "../utils/http-error.js";

// SchoolFlow stores every asset as an authenticated Cloudinary `raw` file.
// Raw delivery preserves the original bytes and avoids Cloudinary image
// transformations changing a document or logo that has a stored sha256 checksum.
export const CLOUDINARY_RESOURCE_TYPE = "raw";
export const CLOUDINARY_DELIVERY_TYPE = "authenticated";
export const CLOUDINARY_DEFAULT_FOLDER = "schoolflow";
export const CLOUDINARY_DEFAULT_URL_TTL_SECONDS = 900;

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
    client = cloudinary
} = {}) => {
    if (!cloudName || !apiKey || !apiSecret) {
        throw new TypeError("Cloudinary storage requires cloudName, apiKey, and apiSecret");
    }
    if (!client
        || typeof client.config !== "function"
        || typeof client.uploader?.upload !== "function"
        || typeof client.uploader?.destroy !== "function"
        || typeof client.utils?.private_download_url !== "function") {
        throw new TypeError("Cloudinary client must provide config, uploader.upload, uploader.destroy, and utils.private_download_url");
    }

    client.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure });

    const ttl = Number.isFinite(Number(urlExpirySeconds)) && Number(urlExpirySeconds) > 0
        ? Math.floor(Number(urlExpirySeconds))
        : CLOUDINARY_DEFAULT_URL_TTL_SECONDS;

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
                tags: [CLOUDINARY_DEFAULT_FOLDER]
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
                invalidate: true
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
        const seconds = Number.isFinite(Number(expiresIn)) && Number(expiresIn) > 0
            ? Math.floor(Number(expiresIn))
            : ttl;
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

    return { upload, delete: remove, createDownloadUrl };
};
