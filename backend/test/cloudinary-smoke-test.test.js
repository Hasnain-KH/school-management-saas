import assert from "node:assert/strict";
import test from "node:test";
import { runCloudinarySmokeTest } from "../scripts/cloudinary-smoke-run.js";

// All values below are dummy fixtures. A fake client and fake fetch are
// injected, so no network request can be made by any test in this file.
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9nRZUAAAAASUVORK5CYII=";
const PNG = Buffer.from(PNG_BASE64, "base64");
const RUN_ID = "smokerun01";
const FOLDER = `schoolflow-smoketest-${RUN_ID}`;
const KEY = `smoke/disposable-${RUN_ID}.png`;
const PUBLIC_ID = `${FOLDER}/${KEY}`;
const SIGNED_URL = `https://api.cloudinary.com/v1_1/test-cloud/raw/download?timestamp=2000000000`
    + `&public_id=${encodeURIComponent(PUBLIC_ID)}&format=png&type=authenticated`
    + `&expires_at=2000000000&signature=fake-signature&api_key=test-key`;

const makeEnv = (overrides = {}) => ({
    CLOUDINARY_SMOKE_TEST: "true",
    STORAGE_PROVIDER: "cloudinary",
    CLOUDINARY_CLOUD_NAME: "test-cloud",
    CLOUDINARY_API_KEY: "test-key",
    CLOUDINARY_API_SECRET: "test-secret",
    ...overrides
});

const makeClient = ({ uploadResult, uploadError, destroyError, downloadError, signedUrl = SIGNED_URL } = {}) => {
    const calls = { config: [], upload: [], destroy: [], downloadUrl: [], resource: [], signRequest: [] };
    const client = {
        config: (options) => { calls.config.push(options); },
        uploader: {
            upload: async (file, options) => {
                calls.upload.push({ file, options });
                if (uploadError) throw uploadError;
                return uploadResult ?? { public_id: options.public_id };
            },
            destroy: async (publicId, options) => {
                calls.destroy.push({ publicId, options });
                if (destroyError) throw destroyError;
                return { result: "ok" };
            }
        },
        utils: {
            private_download_url: (publicId, format, options) => {
                calls.downloadUrl.push({ publicId, format, options });
                if (downloadError) throw downloadError;
                return signedUrl;
            },
            // Direct-upload capability detection requires signing support. The
            // signature is fake; no provider call is made by this fixture.
            api_sign_request: (params) => {
                calls.signRequest.push(params);
                return "fake-signature";
            }
        },
        api: {
            resource: async (publicId, options) => {
                calls.resource.push({ publicId, options });
                return { public_id: publicId, bytes: PNG.length, format: "png" };
            }
        }
    };
    return { client, calls };
};

const asArrayBuffer = (bytes) => {
    const copy = new Uint8Array(bytes);
    return copy.buffer;
};

const makeFetch = ({ signedBytes = PNG, signedOk = true, unsignedOk = false } = {}) => {
    const calls = [];
    const fetchImpl = async (url) => {
        calls.push(String(url));
        const isSigned = String(url).includes("/raw/download?");
        return {
            ok: isSigned ? signedOk : unsignedOk,
            status: isSigned ? (signedOk ? 200 : 403) : (unsignedOk ? 200 : 403),
            arrayBuffer: async () => asArrayBuffer(isSigned ? signedBytes : PNG)
        };
    };
    return { fetchImpl, calls };
};

const makeLog = () => {
    const lines = [];
    return { log: (message) => lines.push(String(message)), lines };
};

test("gate disabled: no network call for any non-exact value", async () => {
    for (const value of ["false", "TRUE", "1", "", undefined]) {
        const { client, calls } = makeClient();
        const { fetchImpl, calls: urls } = makeFetch();
        const { log, lines } = makeLog();

        const result = await runCloudinarySmokeTest({
            env: makeEnv({ CLOUDINARY_SMOKE_TEST: value }),
            client,
            fetchImpl,
            log,
            runId: RUN_ID
        });

        assert.equal(result.ok, false);
        assert.equal(result.gate, "DISABLED");
        assert.equal(result.reason, "GATE_DISABLED");
        assert.equal(calls.config.length, 0);
        assert.equal(calls.upload.length, 0);
        assert.equal(calls.downloadUrl.length, 0);
        assert.equal(calls.destroy.length, 0);
        assert.equal(urls.length, 0);
        assert.deepEqual(lines, ["gate: DISABLED (set CLOUDINARY_SMOKE_TEST=true to enable)"]);
    }
});

test("missing credentials: no network call", async () => {
    for (const missingName of [
        "STORAGE_PROVIDER",
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET"
    ]) {
        const env = makeEnv();
        delete env[missingName];
        const { client, calls } = makeClient();
        const { fetchImpl, calls: urls } = makeFetch();
        const { log, lines } = makeLog();

        const result = await runCloudinarySmokeTest({ env, client, fetchImpl, log, runId: RUN_ID });

        assert.equal(result.ok, false);
        assert.equal(result.configuration, "INVALID");
        assert.equal(result.reason, "MISSING_CREDENTIALS");
        assert.equal(calls.config.length, 0);
        assert.equal(calls.upload.length, 0);
        assert.equal(calls.destroy.length, 0);
        assert.equal(urls.length, 0);
        assert.equal(lines.join("\n").includes(missingName), false);
        assert.equal(lines.join("\n").includes("test-secret"), false);
    }
});

test("successful mocked upload, signed download, byte check, private delivery and delete", async () => {
    const { client, calls } = makeClient();
    const { fetchImpl, calls: urls } = makeFetch();
    const { log, lines } = makeLog();

    const result = await runCloudinarySmokeTest({
        env: makeEnv(),
        client,
        fetchImpl,
        log,
        runId: RUN_ID
    });

    assert.equal(result.ok, true);
    assert.equal(result.reason, null);
    assert.equal(result.upload, "PASS");
    assert.equal(result.privateDelivery, "PASS");
    assert.equal(result.cleanup, "PASS");
    assert.equal(result.publicId, PUBLIC_ID);

    assert.equal(calls.upload.length, 1);
    assert.equal(calls.upload[0].options.resource_type, "raw");
    assert.equal(calls.upload[0].options.type, "authenticated");
    assert.equal(calls.upload[0].options.overwrite, false);
    assert.equal(Buffer.from(calls.upload[0].file.split(",")[1], "base64").equals(PNG), true);

    assert.equal(calls.downloadUrl.length, 1);
    assert.equal(calls.downloadUrl[0].publicId, PUBLIC_ID);
    assert.equal(calls.downloadUrl[0].format, "png");
    assert.equal(calls.downloadUrl[0].options.resource_type, "raw");
    assert.equal(calls.downloadUrl[0].options.type, "authenticated");
    assert.ok(calls.downloadUrl[0].options.expires_at > 0);

    assert.equal(urls.length, 2);
    assert.equal(urls[0], SIGNED_URL);
    assert.equal(urls[1].includes("/s--"), false);
    assert.equal(urls[1].includes(`/raw/authenticated/${PUBLIC_ID}`), true);

    assert.equal(lines.join("\n").includes(SIGNED_URL), false);
    assert.equal(lines.join("\n").includes("test-secret"), false);
});

test("invalid signed URL shapes fail safely and still clean up", async () => {
    const cases = [
        [
            `https://res.cloudinary.com/test-cloud/raw/authenticated/s--signature--/${PUBLIC_ID}.png`,
            "URL_NOT_AUTHENTICATED_RAW"
        ],
        [
            `https://api.cloudinary.com/v1_1/test-cloud/raw/download?public_id=${encodeURIComponent(PUBLIC_ID)}&type=authenticated`,
            "URL_NOT_SIGNED"
        ],
        [
            `https://api.cloudinary.com/v1_1/test-cloud/raw/download?type=authenticated&expires_at=2000000000`
            + `&signature=fake-signature&api_key=test-key&public_id=${encodeURIComponent(`${PUBLIC_ID}.png`)}`,
            "URL_PUBLIC_ID_MISMATCH"
        ]
    ];

    for (const [signedUrl, reason] of cases) {
        const { client, calls } = makeClient({ signedUrl });
        const { fetchImpl, calls: urls } = makeFetch();
        const { log, lines } = makeLog();

        const result = await runCloudinarySmokeTest({
            env: makeEnv(), client, fetchImpl, log, runId: RUN_ID
        });

        assert.equal(result.reason, reason);
        assert.equal(result.cleanup, "PASS");
        assert.equal(calls.destroy.length, 1);
        assert.equal(urls.length, 0);
        assert.equal(lines.join("\n").includes("test-secret"), false);
        assert.equal(lines.join("\n").includes(signedUrl), false);
    }
});

test("signed download failure still cleans up and prints only the safe code", async () => {
    const { client, calls } = makeClient();
    const { fetchImpl, calls: urls } = makeFetch({ signedOk: false });
    const { log, lines } = makeLog();

    const result = await runCloudinarySmokeTest({
        env: makeEnv(), client, fetchImpl, log, runId: RUN_ID
    });

    assert.equal(result.reason, "SIGNED_DOWNLOAD_FAILED");
    assert.equal(result.cleanup, "PASS");
    assert.equal(calls.destroy.length, 1);
    assert.equal(urls.length, 1);
    assert.equal(lines.includes("smoke: FAILED (SIGNED_DOWNLOAD_FAILED)"), true);
    assert.equal(lines.join("\n").includes(SIGNED_URL), false);
    assert.equal(lines.join("\n").includes("test-secret"), false);
});

test("download URL failures are classified without exposing details", async () => {
    const cause = { http_code: 429, message: "boom with test-secret" };
    const { client, calls } = makeClient({ downloadError: cause });
    const { fetchImpl, calls: urls } = makeFetch();
    const { log, lines } = makeLog();

    const result = await runCloudinarySmokeTest({
        env: makeEnv(), client, fetchImpl, log, runId: RUN_ID
    });

    assert.equal(result.reason, "RATE_LIMIT");
    assert.equal(result.cleanup, "PASS");
    assert.equal(calls.destroy.length, 1);
    assert.equal(urls.length, 0);
    assert.equal(lines.includes("smoke: FAILED (RATE_LIMIT)"), true);
    assert.equal(lines.join("\n").includes("test-secret"), false);
    assert.equal(lines.join("\n").includes("boom"), false);
});

test("upload failures report only allowlisted categories and never error details", async () => {
    const cases = [
        [{ code: "ENOTFOUND" }, "NETWORK"],
        [{ http_code: 401 }, "AUTH"],
        [{ http_code: 400 }, "INVALID_CONFIG"],
        [{ http_code: 429 }, "RATE_LIMIT"],
        [{ http_code: 503 }, "SERVER_ERROR"],
        [{ http_code: 599 }, "UNKNOWN"]
    ];
    const secretBearingMessage = `boom with test-secret and ${SIGNED_URL}`;

    for (const [cause, category] of cases) {
        cause.message = secretBearingMessage;
        const { client, calls } = makeClient({ uploadError: cause });
        const { fetchImpl, calls: urls } = makeFetch();
        const { log, lines } = makeLog();

        const result = await runCloudinarySmokeTest({
            env: makeEnv(), client, fetchImpl, log, runId: RUN_ID
        });

        assert.equal(result.ok, false);
        assert.equal(result.upload, "NOT_ATTEMPTED");
        assert.equal(result.reason, category);
        assert.equal(lines.includes(`smoke: FAILED (${category})`), true);
        assert.equal(lines.join("\n").includes("test-secret"), false);
        assert.equal(lines.join("\n").includes(SIGNED_URL), false);
        assert.equal(lines.join("\n").includes("boom"), false);
        assert.equal(calls.destroy.length, 0);
        assert.equal(urls.length, 0);
    }
});

test("unallowlisted reason strings are never logged", async () => {
    const dangerousFetch = async () => {
        const error = new Error("boom with test-secret");
        error.code = "CLOUDINARY_UPLOAD_FAILED";
        error.category = "UNALLOWED";
        throw error;
    };
    const { client, calls } = makeClient();
    const { log, lines } = makeLog();

    const result = await runCloudinarySmokeTest({
        env: makeEnv(), client, fetchImpl: dangerousFetch, log, runId: RUN_ID
    });

    assert.equal(result.reason, "UNEXPECTED_FAILURE");
    assert.equal(lines.includes("smoke: FAILED (UNEXPECTED_FAILURE)"), true);
    assert.equal(lines.join("\n").includes("test-secret"), false);
    assert.equal(lines.join("\n").includes("UNALLOWED"), false);
    assert.equal(calls.destroy.length, 1);
});

test("byte mismatch fails the smoke test but still cleans up", async () => {
    const { client, calls } = makeClient();
    const { fetchImpl } = makeFetch({ signedBytes: Buffer.from("different bytes") });
    const { log, lines } = makeLog();

    const result = await runCloudinarySmokeTest({
        env: makeEnv(), client, fetchImpl, log, runId: RUN_ID
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "BYTE_MISMATCH");
    assert.equal(result.cleanup, "PASS");
    assert.equal(calls.destroy.length, 1);
    assert.equal(lines.includes("cleanup: PASS"), true);
});

test("private-delivery failure fails the smoke test but still cleans up", async () => {
    const { client, calls } = makeClient();
    const { fetchImpl } = makeFetch({ unsignedOk: true });
    const { log } = makeLog();

    const result = await runCloudinarySmokeTest({
        env: makeEnv(), client, fetchImpl, log, runId: RUN_ID
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "PRIVATE_DELIVERY_FAILED");
    assert.equal(result.cleanup, "PASS");
    assert.equal(calls.destroy.length, 1);
});

test("cleanup runs after an assertion failure following a successful upload", async () => {
    const { client, calls } = makeClient({ signedUrl: "http://insecure.example.test/asset" });
    const { fetchImpl, calls: urls } = makeFetch();
    const { log } = makeLog();

    const result = await runCloudinarySmokeTest({
        env: makeEnv(), client, fetchImpl, log, runId: RUN_ID
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "URL_NOT_HTTPS");
    assert.equal(result.cleanup, "PASS");
    assert.equal(calls.upload.length, 1);
    assert.equal(calls.destroy.length, 1);
    assert.equal(calls.destroy[0].publicId, PUBLIC_ID);
    assert.equal(urls.length, 0);
});

test("cleanup failure reports only the exact public ID", async () => {
    const { client, calls } = makeClient({ destroyError: new Error("boom with secret test-secret") });
    const { fetchImpl } = makeFetch();
    const { log, lines } = makeLog();

    const result = await runCloudinarySmokeTest({
        env: makeEnv(), client, fetchImpl, log, runId: RUN_ID
    });

    assert.equal(result.cleanup, "FAILED");
    assert.equal(result.publicId, PUBLIC_ID);
    assert.equal(lines.includes(`cleanup: FAILED publicId=${PUBLIC_ID}`), true);
    assert.equal(lines.join("\n").includes("boom"), false);
    assert.equal(lines.join("\n").includes("test-secret"), false);
    assert.equal(lines.join("\n").includes("http"), false);
});

test("deletion is limited to the exact single uploaded asset", async () => {
    const { client, calls } = makeClient();
    const { fetchImpl } = makeFetch();
    const { log } = makeLog();

    await runCloudinarySmokeTest({ env: makeEnv(), client, fetchImpl, log, runId: RUN_ID });

    assert.equal(calls.destroy.length, 1);
    assert.equal(calls.destroy[0].publicId, PUBLIC_ID);
    assert.equal(calls.destroy[0].options.resource_type, "raw");
    assert.equal(calls.destroy[0].options.type, "authenticated");
    assert.equal(calls.destroy[0].options.invalidate, true);
    assert.equal(Object.keys(client.uploader).join(","), "upload,destroy");
});
