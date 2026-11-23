import assert from "node:assert/strict";
import test from "node:test";
import {
    CLOUDINARY_DEFAULT_FOLDER,
    CLOUDINARY_DELIVERY_TYPE,
    CLOUDINARY_RESOURCE_TYPE,
    createCloudinaryStorage,
    toCloudinaryPublicId
} from "../src/services/cloudinary-storage.provider.js";

// Dummy values only. The injected client guarantees no network call is made.
const CLOUD_NAME = "test-cloud";
const API_KEY = "test-key";
const API_SECRET = "test-secret";
const SCHOOL_A = "64a000000000000000000001";
const SCHOOL_B = "64b000000000000000000002";
const KEY = `logos/${SCHOOL_A}/uuid-logo.png`;

const makeClient = ({
    downloadUrl = "https://api.example.test/download?signature=fake",
    downloadError,
    resourceResult,
    resourceError
} = {}) => {
    const calls = { config: [], upload: [], destroy: [], downloadUrl: [], sign: [], resource: [] };
    const client = {
        config: (options) => { calls.config.push(options); },
        uploader: {
            upload: async (file, options) => {
                calls.upload.push({ file, options });
                return { public_id: options.public_id };
            },
            destroy: async (publicId, options) => {
                calls.destroy.push({ publicId, options });
                return { result: "ok" };
            }
        },
        utils: {
            private_download_url: (publicId, format, options) => {
                calls.downloadUrl.push({ publicId, format, options });
                if (downloadError) throw downloadError;
                return downloadUrl;
            },
            api_sign_request: (params, secret) => {
                calls.sign.push({ params, secret });
                return "test-signature";
            }
        },
        api: {
            resource: async (publicId, options) => {
                calls.resource.push({ publicId, options });
                if (resourceError) throw resourceError;
                return resourceResult ?? {
                    public_id: publicId,
                    bytes: 1024,
                    format: "png",
                    etag: "etag-test",
                    duration: undefined,
                    created_at: "2024-01-01T00:00:00Z"
                };
            }
        }
    };
    return { client, calls };
};

const makeStorage = (client, overrides = {}) => createCloudinaryStorage({
    cloudName: CLOUD_NAME,
    apiKey: API_KEY,
    apiSecret: API_SECRET,
    client,
    ...overrides
});

test("Cloudinary storage rejects incomplete configuration", () => {
    const { client } = makeClient();
    assert.throws(
        () => createCloudinaryStorage({ cloudName: CLOUD_NAME, client }),
        /requires cloudName, apiKey, and apiSecret/
    );
    assert.throws(
        () => createCloudinaryStorage({ cloudName: CLOUD_NAME, apiKey: API_KEY, apiSecret: API_SECRET, client: {} }),
        /must provide config/
    );
});

test("public IDs are deterministic and keep the school-specific prefix", () => {
    const expected = `${CLOUDINARY_DEFAULT_FOLDER}/logos/${SCHOOL_A}/uuid-logo.png`;
    assert.equal(toCloudinaryPublicId(KEY), expected);
    assert.equal(toCloudinaryPublicId(KEY), toCloudinaryPublicId(KEY));
    assert.notEqual(toCloudinaryPublicId(KEY), toCloudinaryPublicId(`logos/${SCHOOL_B}/uuid-logo.png`));
    assert.equal(toCloudinaryPublicId(KEY, "custom/folder"), `custom/folder/logos/${SCHOOL_A}/uuid-logo.png`);
    assert.throws(() => toCloudinaryPublicId(""), /non-empty string/);
});

test("Cloudinary client is configured for authenticated HTTPS delivery", () => {
    const { client, calls } = makeClient();
    makeStorage(client);

    assert.equal(calls.config.length, 1);
    assert.equal(calls.config[0].cloud_name, CLOUD_NAME);
    assert.equal(calls.config[0].api_key, API_KEY);
    assert.equal(calls.config[0].api_secret, API_SECRET);
    assert.equal(calls.config[0].secure, true);
});

test("upload sends original bytes as an authenticated raw asset", async () => {
    const { client, calls } = makeClient();
    const storage = makeStorage(client);
    const body = Buffer.from("original-bytes");

    const result = await storage.upload({ key: KEY, body, contentType: "image/png" });

    assert.equal(result.key, KEY);
    assert.equal(result.publicId, `${CLOUDINARY_DEFAULT_FOLDER}/logos/${SCHOOL_A}/uuid-logo.png`);
    assert.equal(calls.upload.length, 1);
    assert.match(calls.upload[0].file, /^data:image\/png;base64,/);
    assert.equal(Buffer.from(calls.upload[0].file.split(",")[1], "base64").toString(), "original-bytes");

    const options = calls.upload[0].options;
    assert.equal(options.public_id, result.publicId);
    assert.equal(options.resource_type, CLOUDINARY_RESOURCE_TYPE);
    assert.equal(options.type, CLOUDINARY_DELIVERY_TYPE);
    assert.equal(options.overwrite, false);
    assert.equal(options.tags.includes(CLOUDINARY_DEFAULT_FOLDER), true);
    assert.equal(options.timeout, 10000);
});

test("upload failures expose allowlisted categories without error details", async () => {
    const cases = [
        [{ http_code: 401 }, "AUTH"],
        [{ statusCode: 403 }, "AUTH"],
        [{ error: { code: 400 } }, "INVALID_CONFIG"],
        [{ status: 404 }, "INVALID_CONFIG"],
        [{ http_code: 429 }, "RATE_LIMIT"],
        [{ code: "ENOTFOUND" }, "NETWORK"],
        [{ code: "ECONNRESET" }, "NETWORK"],
        [{ http_code: 503 }, "SERVER_ERROR"],
        [{ http_code: 599 }, "UNKNOWN"],
        [{ code: "SOME_INTERNAL_CODE" }, "UNKNOWN"]
    ];
    const secretBearingMessage = "secret test-secret in a response body";

    for (const [cause, category] of cases) {
        cause.message = secretBearingMessage;
        const { client } = makeClient();
        client.uploader.upload = async () => { throw cause; };
        const storage = makeStorage(client);

        await assert.rejects(
            () => storage.upload({ key: KEY, body: Buffer.from("bytes"), contentType: "image/png" }),
            (error) => {
                assert.equal(error.code, "CLOUDINARY_UPLOAD_FAILED");
                assert.equal(error.category, category);
                assert.equal(error.message.includes("secret"), false);
                assert.equal(JSON.stringify(error).includes(secretBearingMessage), false);
                return true;
            }
        );
    }
});

test("delete uses the same raw authenticated public ID and tolerates missing assets", async () => {
    const { client, calls } = makeClient();
    const storage = makeStorage(client);

    assert.deepEqual(await storage.delete({ key: KEY }), { deleted: true });
    assert.equal(calls.destroy[0].publicId, `${CLOUDINARY_DEFAULT_FOLDER}/logos/${SCHOOL_A}/uuid-logo.png`);
    assert.equal(calls.destroy[0].options.resource_type, CLOUDINARY_RESOURCE_TYPE);
    assert.equal(calls.destroy[0].options.type, CLOUDINARY_DELIVERY_TYPE);
    assert.equal(calls.destroy[0].options.invalidate, true);
    assert.equal(calls.destroy[0].options.timeout, 10000);

    client.uploader.destroy = async () => ({ result: "not found" });
    assert.deepEqual(await storage.delete({ key: KEY }), { deleted: true });

    client.uploader.destroy = async () => ({ result: "error" });
    await assert.rejects(
        () => storage.delete({ key: KEY }),
        (error) => error.statusCode === 502 && error.code === "CLOUDINARY_DELETE_FAILED"
    );
});

test("download URLs use private_download_url for raw authenticated assets", async () => {
    const { client, calls } = makeClient();
    const storage = makeStorage(client, { urlExpirySeconds: 120 });
    const before = Math.floor(Date.now() / 1000);

    const url = await storage.createDownloadUrl({ key: KEY, contentType: "application/pdf" });
    const after = Math.floor(Date.now() / 1000);

    assert.equal(url, "https://api.example.test/download?signature=fake");
    const call = calls.downloadUrl[0];
    assert.equal(call.publicId, `${CLOUDINARY_DEFAULT_FOLDER}/${KEY}`);
    assert.equal(call.publicId.endsWith(".pdf.pdf"), false);
    assert.equal(call.format, "pdf");
    assert.equal(call.options.resource_type, CLOUDINARY_RESOURCE_TYPE);
    assert.equal(call.options.type, CLOUDINARY_DELIVERY_TYPE);
    assert.ok(call.options.expires_at >= before + 120);
    assert.ok(call.options.expires_at <= after + 120);
    assert.equal(JSON.stringify(call.options).includes(API_SECRET), false);

    await storage.createDownloadUrl({ key: KEY });
    assert.equal(calls.downloadUrl[1].publicId, `${CLOUDINARY_DEFAULT_FOLDER}/${KEY}`);
    assert.equal(calls.downloadUrl[1].format, "png");
});

test("download URL failures expose only allowlisted categories", async () => {
    const cause = { http_code: 401, message: "boom with test-secret" };
    const { client } = makeClient({ downloadError: cause });
    const storage = makeStorage(client);

    await assert.rejects(
        () => storage.createDownloadUrl({ key: KEY, contentType: "image/png" }),
        (error) => {
            assert.equal(error.code, "CLOUDINARY_DOWNLOAD_URL_FAILED");
            assert.equal(error.category, "AUTH");
            assert.equal(error.message.includes("test-secret"), false);
            assert.equal(JSON.stringify(error).includes("boom"), false);
            return true;
        }
    );
});

test("Cloudinary client must expose signing and resource lookup capabilities", () => {
    const { client } = makeClient();
    delete client.utils.api_sign_request;
    assert.throws(() => makeStorage(client), (error) => {
        assert.match(error.message, /utils\.api_sign_request/);
        assert.equal(error.message.includes(API_SECRET), false);
        return true;
    });

    const { client: missingApi } = makeClient();
    delete missingApi.api;
    assert.throws(() => makeStorage(missingApi), /api\.resource/);
});

test("createUploadAuthorization signs a POST descriptor without exposing the secret", () => {
    const { client, calls } = makeClient();
    const storage = makeStorage(client);
    const before = Math.floor(Date.now() / 1000);

    const auth = storage.createUploadAuthorization({ key: KEY, contentType: "image/png", expiresInSeconds: 99999 });
    const after = Math.floor(Date.now() / 1000);
    const expectedPublicId = `${CLOUDINARY_DEFAULT_FOLDER}/${KEY}`;

    assert.equal(auth.kind, "cloudinarySignedPost");
    assert.equal(auth.method, "POST");
    assert.equal(auth.url, `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`);
    assert.equal(auth.key, KEY);
    assert.equal(auth.contentType, "image/png");
    assert.equal(auth.expiresInSeconds, 300);
    assert.deepEqual(Object.keys(auth.fields).sort(), [
        "api_key", "context", "overwrite", "public_id", "resource_type", "signature", "tags", "timestamp", "type"
    ]);
    assert.equal(auth.fields.public_id, expectedPublicId);
    assert.equal(auth.fields.resource_type, CLOUDINARY_RESOURCE_TYPE);
    assert.equal(auth.fields.type, CLOUDINARY_DELIVERY_TYPE);
    assert.equal(auth.fields.overwrite, "false");
    assert.equal(auth.fields.context, `storage_key=${expectedPublicId}`);
    assert.deepEqual(auth.fields.tags, [CLOUDINARY_DEFAULT_FOLDER]);
    assert.equal(auth.fields.api_key, API_KEY);
    assert.equal(auth.fields.signature, "test-signature");
    assert.equal(auth.fields.api_secret, undefined);
    assert.equal(Number.isInteger(auth.fields.timestamp), true);
    assert.ok(auth.fields.timestamp >= before && auth.fields.timestamp <= after + 300);
    assert.equal(auth.expiresAt, new Date((auth.fields.timestamp + 300) * 1000).toISOString());
    assert.equal(JSON.stringify(auth).includes(API_SECRET), false);

    assert.equal(calls.sign.length, 1);
    assert.equal(calls.sign[0].secret, API_SECRET);
    assert.deepEqual(calls.sign[0].params, {
        public_id: expectedPublicId,
        resource_type: CLOUDINARY_RESOURCE_TYPE,
        type: CLOUDINARY_DELIVERY_TYPE,
        overwrite: "false",
        context: `storage_key=${expectedPublicId}`,
        tags: [CLOUDINARY_DEFAULT_FOLDER],
        timestamp: auth.fields.timestamp
    });
});

test("createUploadAuthorization honours insecure endpoints and short TTLs", () => {
    const storage = makeStorage(makeClient().client, { secure: false });
    const auth = storage.createUploadAuthorization({ key: KEY, expiresInSeconds: 60 });

    assert.equal(auth.url, `http://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`);
    assert.equal(auth.expiresInSeconds, 60);
    assert.equal(auth.contentType, "application/octet-stream");
});

test("getObjectMetadata maps a Cloudinary resource lookup", async () => {
    const result = {
        public_id: `${CLOUDINARY_DEFAULT_FOLDER}/${KEY}`,
        bytes: 2048,
        format: "pdf",
        etag: "etag-1",
        duration: 12.5,
        created_at: "2024-02-03T04:05:06Z"
    };
    const { client, calls } = makeClient({ resourceResult: result });
    const storage = makeStorage(client);

    assert.deepEqual(await storage.getObjectMetadata({ key: KEY }), {
        key: KEY,
        publicId: result.public_id,
        sizeBytes: 2048,
        contentType: "pdf",
        etag: "etag-1",
        durationSeconds: 12.5,
        lastModified: "2024-02-03T04:05:06Z"
    });
    assert.equal(calls.resource.length, 1);
    assert.equal(calls.resource[0].publicId, result.public_id);
    assert.deepEqual(calls.resource[0].options, { resource_type: "raw", type: "authenticated" });
});

test("getObjectMetadata maps absent optional fields to null", async () => {
    const { client } = makeClient({ resourceResult: { public_id: toCloudinaryPublicId(KEY) } });
    const metadata = await makeStorage(client).getObjectMetadata({ key: KEY });

    assert.equal(metadata.sizeBytes, null);
    assert.equal(metadata.contentType, null);
    assert.equal(metadata.etag, null);
    assert.equal(metadata.durationSeconds, null);
    assert.equal(metadata.lastModified, null);
});

test("getObjectMetadata rejects a mismatched public_id and classifies lookup failures", async () => {
    const { client } = makeClient({ resourceResult: { public_id: `${CLOUDINARY_DEFAULT_FOLDER}/other` } });
    await assert.rejects(
        () => makeStorage(client).getObjectMetadata({ key: KEY }),
        (error) => error.code === "CLOUDINARY_OBJECT_LOOKUP_INVALID" && error.statusCode === 502
    );

    const cause = { http_code: 401, message: "boom with test-secret" };
    const { client: failing } = makeClient({ resourceError: cause });
    await assert.rejects(
        () => makeStorage(failing).getObjectMetadata({ key: KEY }),
        (error) => {
            assert.equal(error.code, "CLOUDINARY_OBJECT_LOOKUP_FAILED");
            assert.equal(error.category, "AUTH");
            assert.equal(error.message.includes("test-secret"), false);
            assert.equal(JSON.stringify(error).includes("boom"), false);
            return true;
        }
    );
});

test("getObjectMetadata returns null for missing resources", async () => {
    const notFoundResult = makeClient({ resourceResult: "not found" });
    assert.equal(await makeStorage(notFoundResult.client).getObjectMetadata({ key: KEY }), null);

    const notFoundError = makeClient({ resourceError: { http_code: 404, message: "boom with test-secret" } });
    assert.equal(await makeStorage(notFoundError.client).getObjectMetadata({ key: KEY }), null);
});

test("readObjectBytes fetches a short-lived download URL and returns bytes", async () => {
    const { client, calls } = makeClient();
    const bytes = Buffer.from("hello");
    const fetchCalls = [];
    const fetchImpl = async (url, init) => {
        fetchCalls.push({ url, init });
        return { ok: true, status: 200, arrayBuffer: async () => Uint8Array.from(bytes).buffer };
    };
    const storage = makeStorage(client, { fetchImpl });
    const before = Math.floor(Date.now() / 1000);

    const result = await storage.readObjectBytes({ key: KEY, maxBytes: 10 });
    const after = Math.floor(Date.now() / 1000);

    assert.deepEqual(result, bytes);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "https://api.example.test/download?signature=fake");
    assert.ok(fetchCalls[0].init.signal instanceof AbortSignal);
    assert.equal(calls.downloadUrl.length, 1);
    assert.ok(calls.downloadUrl[0].options.expires_at >= before + 60);
    assert.ok(calls.downloadUrl[0].options.expires_at <= after + 60);
});

test("readObjectBytes maps 404 to null and other failures to allowlisted categories", async () => {
    const missing = makeStorage(makeClient().client, {
        fetchImpl: async () => ({ ok: false, status: 404 })
    });
    assert.equal(await missing.readObjectBytes({ key: KEY, maxBytes: 10 }), null);

    const failing = makeStorage(makeClient().client, {
        fetchImpl: async () => ({ ok: false, status: 401 })
    });
    await assert.rejects(
        () => failing.readObjectBytes({ key: KEY, maxBytes: 10 }),
        (error) => {
            assert.equal(error.code, "CLOUDINARY_OBJECT_READ_FAILED");
            assert.equal(error.category, "AUTH");
            assert.equal(error.statusCode, 502);
            return true;
        }
    );

    const network = makeStorage(makeClient().client, {
        fetchImpl: async () => { throw { code: "ENOTFOUND", message: "boom with test-secret" }; }
    });
    await assert.rejects(
        () => network.readObjectBytes({ key: KEY, maxBytes: 10 }),
        (error) => {
            assert.equal(error.code, "CLOUDINARY_OBJECT_READ_FAILED");
            assert.equal(error.category, "NETWORK");
            assert.equal(error.message.includes("test-secret"), false);
            assert.equal(JSON.stringify(error).includes("boom"), false);
            return true;
        }
    );
});

test("readObjectBytes rejects oversized objects with STORAGE_OBJECT_TOO_LARGE", async () => {
    const bytes = Buffer.from("hello");
    const storage = makeStorage(makeClient().client, {
        fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => Uint8Array.from(bytes).buffer })
    });

    await assert.rejects(
        () => storage.readObjectBytes({ key: KEY, maxBytes: 3 }),
        (error) => error.statusCode === 400 && error.code === "STORAGE_OBJECT_TOO_LARGE"
    );
    // The test for the exact boundary mirrors the S3 adapter: maxBytes + 1 is allowed.
    assert.deepEqual(await storage.readObjectBytes({ key: KEY, maxBytes: 4 }), bytes);
});

test("getCapabilities advertises direct upload, lookup, read and a 10 MB cap", () => {
    assert.deepEqual(makeStorage(makeClient().client).getCapabilities(), {
        directUpload: "cloudinarySignedPost",
        objectLookup: true,
        objectRead: true,
        maxUploadBytes: 10 * 1024 * 1024,
        uploadAuthTtlSeconds: 300
    });
});
