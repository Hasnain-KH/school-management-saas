// Standalone, opt-in Cloudinary smoke test.
//
// Deliberately isolated: this file imports only Node built-ins and the
// Cloudinary storage adapter. It never imports Express, Mongoose, MongoDB,
// school-logo services, document services, or the application/server, and it
// never reads real school records. No network request is made unless
// CLOUDINARY_SMOKE_TEST is exactly "true" and every credential is present.
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
    CLOUDINARY_DELIVERY_TYPE,
    CLOUDINARY_ERROR_CATEGORIES,
    CLOUDINARY_RESOURCE_TYPE,
    createCloudinaryStorage,
    toCloudinaryPublicId
} from "../src/services/cloudinary-storage.provider.js";

const REQUIRED_ENVIRONMENT = [
    "STORAGE_PROVIDER",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET"
];
const GATE_VALUE = "true";
const SIGNED_URL_TTL = 900;

// A known 1x1 PNG held in memory only. Nothing is read from disk and no school
// asset is ever used. Cloudinary `raw` assets preserve these exact bytes.
const TEST_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9nRZUAAAAASUVORK5CYII=";
const TEST_PNG = Buffer.from(TEST_PNG_BASE64, "base64");
const TEST_PNG_SHA256 = createHash("sha256").update(TEST_PNG).digest("hex");
const PNG_SIGNATURE = "89504e470d0a1a0a";

// Only fixed codes are ever logged; provider error messages, signed URLs,
// credentials, environment values and response bodies are never printed.
const SMOKE_CODES = new Set([
    "PUBLIC_ID_MISMATCH",
    "URL_NOT_HTTPS",
    "URL_NOT_AUTHENTICATED_RAW",
    "URL_NOT_SIGNED",
    "URL_PUBLIC_ID_MISMATCH",
    "URL_CONTAINS_SECRET",
    "SIGNED_DOWNLOAD_FAILED",
    "BYTE_MISMATCH",
    "SHA256_MISMATCH",
    "PRIVATE_DELIVERY_FAILED"
]);

// Provider failures are reported by category only. Only fixed provider codes
// paired with the allowlisted categories above can become a reason; no error
// message, response body, URL or credential is ever logged.
const PROVIDER_CODES = new Set([
    "CLOUDINARY_UPLOAD_FAILED",
    "CLOUDINARY_UPLOAD_INVALID",
    "CLOUDINARY_DELETE_FAILED",
    "CLOUDINARY_DOWNLOAD_URL_FAILED"
]);
const PROVIDER_CATEGORIES = new Set(Object.values(CLOUDINARY_ERROR_CATEGORIES));

const classifyFailure = (error) => {
    if (error instanceof Error && SMOKE_CODES.has(error.message)) return error.message;
    if (
        error instanceof Error
        && PROVIDER_CODES.has(error.code)
        && PROVIDER_CATEGORIES.has(error.category)
    ) {
        return error.category;
    }
    return "UNEXPECTED_FAILURE";
};

const fail = (code) => {
    throw new Error(code);
};

export const runCloudinarySmokeTest = async ({
    env = process.env,
    client = undefined,
    fetchImpl = fetch,
    log = (message) => console.info(message),
    runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
} = {}) => {
    const result = {
        ok: false,
        gate: "DISABLED",
        configuration: "NOT_CHECKED",
        upload: "NOT_ATTEMPTED",
        privateDelivery: "NOT_ATTEMPTED",
        cleanup: "NOT_ATTEMPTED",
        publicId: null,
        reason: null
    };

    // Hard gate first: nothing below runs, and no client/fetch is touched.
    if (env.CLOUDINARY_SMOKE_TEST !== GATE_VALUE) {
        log("gate: DISABLED (set CLOUDINARY_SMOKE_TEST=true to enable)");
        result.reason = "GATE_DISABLED";
        return result;
    }
    result.gate = "ENABLED";

    const missing = REQUIRED_ENVIRONMENT.filter(
        (name) => !Object.prototype.hasOwnProperty.call(env, name) || !String(env[name] ?? "").trim()
    );
    if (missing.length > 0) {
        // Counts only: never the variable values.
        log(`configuration: INVALID (${missing.length} required variable(s) missing)`);
        result.configuration = "INVALID";
        result.reason = "MISSING_CREDENTIALS";
        return result;
    }
    if (env.STORAGE_PROVIDER !== "cloudinary") {
        log("configuration: INVALID (STORAGE_PROVIDER must be cloudinary)");
        result.configuration = "INVALID";
        result.reason = "INVALID_PROVIDER";
        return result;
    }
    if (TEST_PNG.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) {
        log("configuration: INVALID (test PNG signature check failed)");
        result.configuration = "INVALID";
        result.reason = "INVALID_TEST_ASSET";
        return result;
    }
    result.configuration = "VALID";

    const folder = `schoolflow-smoketest-${runId}`;
    const key = `smoke/disposable-${runId}.png`;
    const expectedPublicId = toCloudinaryPublicId(key, folder);

    // `secure` is forced true so the signed URL assertion is meaningful; the
    // smoke test does not read CLOUDINARY_SECURE. The real SDK is used when no
    // client is injected (tests inject a fake client and never hit the network).
    const storage = createCloudinaryStorage({
        cloudName: env.CLOUDINARY_CLOUD_NAME,
        apiKey: env.CLOUDINARY_API_KEY,
        apiSecret: env.CLOUDINARY_API_SECRET,
        folder,
        secure: true,
        urlExpirySeconds: SIGNED_URL_TTL,
        ...(client ? { client } : {})
    });

    let uploadedKey = null;
    let uploadedPublicId = null;

    try {
        const uploaded = await storage.upload({ key, body: TEST_PNG, contentType: "image/png" });
        uploadedKey = uploaded.key;
        uploadedPublicId = uploaded.publicId;
        result.upload = "PASS";
        result.publicId = uploadedPublicId;

        if (uploadedPublicId !== expectedPublicId) fail("PUBLIC_ID_MISMATCH");

        const signedUrl = await storage.createDownloadUrl({ key: uploadedKey, contentType: "image/png" });
        if (!signedUrl.startsWith("https://")) fail("URL_NOT_HTTPS");
        // Authenticated assets are delivered through the SDK's signed
        // /<resource_type>/download API helper, not an unsigned CDN URL.
        if (!signedUrl.includes(`/${CLOUDINARY_RESOURCE_TYPE}/download?`)) {
            fail("URL_NOT_AUTHENTICATED_RAW");
        }
        let signedParams;
        try {
            signedParams = new URL(signedUrl).searchParams;
        } catch {
            fail("URL_NOT_SIGNED");
        }
        if (signedParams.get("type") !== CLOUDINARY_DELIVERY_TYPE) fail("URL_NOT_AUTHENTICATED_RAW");
        if (!signedParams.has("expires_at") || !signedParams.has("signature") || !signedParams.has("api_key")) {
            fail("URL_NOT_SIGNED");
        }
        if (signedParams.get("public_id") !== expectedPublicId) fail("URL_PUBLIC_ID_MISMATCH");
        if (signedUrl.includes(env.CLOUDINARY_API_SECRET)) fail("URL_CONTAINS_SECRET");

        const signedResponse = await fetchImpl(signedUrl);
        if (!signedResponse.ok) fail("SIGNED_DOWNLOAD_FAILED");
        const downloaded = Buffer.from(await signedResponse.arrayBuffer());
        if (!downloaded.equals(TEST_PNG)) fail("BYTE_MISMATCH");
        if (createHash("sha256").update(downloaded).digest("hex") !== TEST_PNG_SHA256) {
            fail("SHA256_MISMATCH");
        }

        // The unsigned URL deliberately omits any signature. An authenticated
        // asset must not be retrievable this way. The URL is never printed.
        const unsignedUrl = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/`
            + `${CLOUDINARY_RESOURCE_TYPE}/${CLOUDINARY_DELIVERY_TYPE}/${expectedPublicId}`;
        const unsignedResponse = await fetchImpl(unsignedUrl);
        if (unsignedResponse.ok) fail("PRIVATE_DELIVERY_FAILED");
        result.privateDelivery = "PASS";

        result.ok = true;
        log("smoke: PASS");
    } catch (error) {
        const code = classifyFailure(error);
        result.reason = code;
        log(`smoke: FAILED (${code})`);
    } finally {
        // Only the exact key returned by the successful upload is deleted.
        // No folder, prefix or bulk deletion is ever attempted.
        if (uploadedKey) {
            try {
                const deleted = await storage.delete({ key: uploadedKey });
                if (!deleted || deleted.deleted !== true) fail("DELETE_NOT_CONFIRMED");
                result.cleanup = "PASS";
                log("cleanup: PASS");
            } catch {
                result.cleanup = "FAILED";
                // Report the exact public ID only; no error object, URL, or secret.
                log(`cleanup: FAILED publicId=${uploadedPublicId ?? expectedPublicId}`);
            }
        } else {
            log("cleanup: NOT_ATTEMPTED (no confirmed upload)");
        }
    }

    return result;
};

const isDirectRun = () => {
    const entry = process.argv[1];
    return Boolean(entry)
        && resolve(entry).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
};

if (isDirectRun()) {
    try {
        await runCloudinarySmokeTest();
    } catch {
        console.info("smoke: FAILED (UNEXPECTED_FAILURE)");
        process.exitCode = 1;
    }
}
