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

const makeClient = ({ downloadUrl = "https://api.example.test/download?signature=fake", downloadError } = {}) => {
    const calls = { config: [], upload: [], destroy: [], downloadUrl: [] };
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
