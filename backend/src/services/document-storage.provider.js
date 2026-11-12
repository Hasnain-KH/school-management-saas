import { createHash, createHmac } from "node:crypto";
import { HttpError } from "../utils/http-error.js";

let provider = null;

export const configureDocumentStorageProvider = (storage) => {
    if (!storage
        || typeof storage.upload !== "function"
        || typeof storage.delete !== "function"
        || typeof storage.createDownloadUrl !== "function") {
        throw new TypeError("Document storage must implement upload, delete, and signed download URLs");
    }
    provider = storage;
};

export const getDocumentStorageProvider = () => {
    if (!provider) {
        throw new HttpError(503, "Document storage is unavailable until a storage provider is configured");
    }
    return provider;
};

export const isDocumentStorageConfigured = () => provider !== null;

const sha256Hex = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

const amzDate = (date) => date.toISOString().replace(/[:-]|\.\d{3}/g, "");
const shortDate = (date) => amzDate(date).slice(0, 8);

const encodeRfc3986 = (value) => encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

const canonicalizeQuery = (params) => Object.keys(params)
    .sort()
    .map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(params[key])}`)
    .join("&");

const deriveSigningKey = (secretAccessKey, date, region, service) => {
    const dateKey = hmac(`AWS4${secretAccessKey}`, shortDate(date));
    const regionKey = hmac(dateKey, region);
    const serviceKey = hmac(regionKey, service);
    return hmac(serviceKey, "aws4_request");
};

// S3-compatible object storage (AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean
// Spaces, MinIO, ...). Implemented with node:crypto + fetch so no SDK is required.
export const createS3CompatibleStorage = ({
    endpoint,
    region = "us-east-1",
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle = true,
    fetchImpl = fetch,
    urlExpirySeconds = 900
} = {}) => {
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
        throw new TypeError("S3-compatible storage requires endpoint, bucket, accessKeyId, and secretAccessKey");
    }
    const parsed = new URL(endpoint);
    const host = parsed.host;
    const basePath = forcePathStyle ? `/${bucket}` : "";
    const objectPath = (key) => `${basePath}/${key.split("/").map(encodeRfc3986).join("/")}`;
    const hostHeader = forcePathStyle ? host : `${bucket}.${host}`;

    const sign = ({ method, path, query = {}, payloadHash, date, extraHeaders = {} }) => {
        const canonicalHeaders = { host: hostHeader, ...extraHeaders };
        const signedHeaderNames = Object.keys(canonicalHeaders).sort();
        const canonicalHeadersString = signedHeaderNames
            .map((name) => `${name}:${String(canonicalHeaders[name]).trim()}`)
            .join("\n");
        const canonicalRequest = [
            method,
            path,
            canonicalizeQuery(query),
            `${canonicalHeadersString}\n`,
            signedHeaderNames.join(";"),
            payloadHash
        ].join("\n");
        const scope = `${shortDate(date)}/${region}/s3/aws4_request`;
        const stringToSign = [
            "AWS4-HMAC-SHA256",
            amzDate(date),
            scope,
            sha256Hex(canonicalRequest)
        ].join("\n");
        const signature = createHmac("sha256", deriveSigningKey(secretAccessKey, date, region, "s3"))
            .update(stringToSign)
            .digest("hex");
        return { signature, signedHeaderNames, scope, canonicalHeaders };
    };

    const upload = async ({ key, body, contentType = "application/octet-stream" }) => {
        const date = new Date();
        const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
        const payloadHash = sha256Hex(payload);
        const path = objectPath(key);
        const { signature, signedHeaderNames, scope, canonicalHeaders } = sign({
            method: "PUT",
            path,
            payloadHash,
            date,
            extraHeaders: { "content-type": contentType }
        });
        const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, `
            + `SignedHeaders=${signedHeaderNames.join(";")}, Signature=${signature}`;
        const response = await fetchImpl(`${parsed.protocol}//${hostHeader}${path}`, {
            method: "PUT",
            headers: {
                ...canonicalHeaders,
                authorization,
                "x-amz-date": amzDate(date),
                "x-amz-content-sha256": payloadHash
            },
            body: payload
        });
        if (!response.ok) {
            const error = new HttpError(502, "The document storage provider rejected the upload");
            error.code = `STORAGE_${response.status}`;
            throw error;
        }
        return { key };
    };

    const remove = async ({ key }) => {
        const date = new Date();
        const path = objectPath(key);
        const { signature, signedHeaderNames, scope, canonicalHeaders } = sign({
            method: "DELETE",
            path,
            payloadHash: sha256Hex(""),
            date
        });
        const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, `
            + `SignedHeaders=${signedHeaderNames.join(";")}, Signature=${signature}`;
        const response = await fetchImpl(`${parsed.protocol}//${hostHeader}${path}`, {
            method: "DELETE",
            headers: {
                ...canonicalHeaders,
                authorization,
                "x-amz-date": amzDate(date),
                "x-amz-content-sha256": sha256Hex("")
            }
        });
        if (!response.ok && response.status !== 404) {
            const error = new HttpError(502, "The document storage provider rejected the deletion");
            error.code = `STORAGE_${response.status}`;
            throw error;
        }
        return { deleted: true };
    };

    const createDownloadUrl = async ({ key, expiresIn = urlExpirySeconds }) => {
        const date = new Date();
        const path = objectPath(key);
        const scope = `${shortDate(date)}/${region}/s3/aws4_request`;
        const query = {
            "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
            "X-Amz-Credential": `${accessKeyId}/${scope}`,
            "X-Amz-Date": amzDate(date),
            "X-Amz-Expires": String(expiresIn),
            "X-Amz-SignedHeaders": "host"
        };
        const canonicalRequest = [
            "GET",
            path,
            canonicalizeQuery(query),
            `host:${hostHeader}\n`,
            "host",
            "UNSIGNED-PAYLOAD"
        ].join("\n");
        const stringToSign = [
            "AWS4-HMAC-SHA256",
            amzDate(date),
            scope,
            sha256Hex(canonicalRequest)
        ].join("\n");
        const signature = createHmac("sha256", deriveSigningKey(secretAccessKey, date, region, "s3"))
            .update(stringToSign)
            .digest("hex");
        return `${parsed.protocol}//${hostHeader}${path}?${canonicalizeQuery(query)}&X-Amz-Signature=${signature}`;
    };

    return { upload, delete: remove, createDownloadUrl };
};

// Configures object storage from environment variables, leaving the 503
// behaviour in place when storage is not provisioned.
export const configureDocumentStorageFromEnv = () => {
    const { STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY } = process.env;
    if (!STORAGE_ENDPOINT || !STORAGE_BUCKET || !STORAGE_ACCESS_KEY_ID || !STORAGE_SECRET_ACCESS_KEY) {
        return null;
    }
    const storage = createS3CompatibleStorage({
        endpoint: STORAGE_ENDPOINT,
        bucket: STORAGE_BUCKET,
        accessKeyId: STORAGE_ACCESS_KEY_ID,
        secretAccessKey: STORAGE_SECRET_ACCESS_KEY,
        region: process.env.STORAGE_REGION ?? "us-east-1",
        forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE !== "false"
    });
    configureDocumentStorageProvider(storage);
    return storage;
};
