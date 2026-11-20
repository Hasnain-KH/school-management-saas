import assert from "node:assert/strict";
import test from "node:test";
import {
    configureDocumentStorageFromEnv,
    getDocumentStorageProvider,
    getDocumentStorageProviderName,
    isDocumentStorageConfigured
} from "../src/services/document-storage.provider.js";

// Dummy values only; these tests never contact a real provider.
const S3_ENV = {
    STORAGE_ENDPOINT: "http://127.0.0.1:5011",
    STORAGE_BUCKET: "test-bucket",
    STORAGE_ACCESS_KEY_ID: "test-access-key",
    STORAGE_SECRET_ACCESS_KEY: "test-secret-key"
};
const CLOUDINARY_ENV = {
    CLOUDINARY_CLOUD_NAME: "test-cloud",
    CLOUDINARY_API_KEY: "test-key",
    CLOUDINARY_API_SECRET: "test-secret"
};
const ENV_KEYS = [
    "STORAGE_PROVIDER",
    "STORAGE_ENDPOINT",
    "STORAGE_BUCKET",
    "STORAGE_ACCESS_KEY_ID",
    "STORAGE_SECRET_ACCESS_KEY",
    "STORAGE_REGION",
    "STORAGE_FORCE_PATH_STYLE",
    ...Object.keys(CLOUDINARY_ENV),
    "CLOUDINARY_FOLDER",
    "CLOUDINARY_SIGNED_URL_TTL",
    "CLOUDINARY_SECURE"
];

const withEnv = (values, fn) => {
    const original = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
    try {
        for (const key of ENV_KEYS) delete process.env[key];
        for (const [key, value] of Object.entries(values)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        return fn();
    } finally {
        for (const [key, value] of original) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
};

test("default provider remains s3 when STORAGE_PROVIDER is unset", () => {
    withEnv(S3_ENV, () => {
        const storage = configureDocumentStorageFromEnv();
        assert.ok(storage);
        assert.equal(getDocumentStorageProviderName(), "s3");
        assert.equal(isDocumentStorageConfigured(), true);
        assert.equal(getDocumentStorageProvider(), storage);
    });
});

test("cloudinary is used only when explicitly selected", () => {
    withEnv({ ...S3_ENV, ...CLOUDINARY_ENV, STORAGE_PROVIDER: "cloudinary" }, () => {
        const storage = configureDocumentStorageFromEnv();
        assert.ok(storage);
        assert.equal(getDocumentStorageProviderName(), "cloudinary");
        assert.equal(getDocumentStorageProvider(), storage);
        assert.equal(getDocumentStorageProvider("cloudinary"), storage);
        assert.notEqual(getDocumentStorageProvider("s3"), storage);
    });
});

test("explicit cloudinary selection never silently falls back to s3", () => {
    withEnv({ ...S3_ENV, STORAGE_PROVIDER: "cloudinary" }, () => {
        const storage = configureDocumentStorageFromEnv();
        assert.equal(storage, null);
        assert.equal(isDocumentStorageConfigured(), false);
        assert.throws(() => getDocumentStorageProvider(), /until a storage provider is configured/);
    });
});

test("an unsupported STORAGE_PROVIDER fails closed", () => {
    withEnv({ ...S3_ENV, STORAGE_PROVIDER: "gcs" }, () => {
        assert.throws(() => configureDocumentStorageFromEnv(), /Unsupported STORAGE_PROVIDER/);
    });
});

test("records can resolve their original provider independently of the default", () => {
    withEnv({ ...S3_ENV, ...CLOUDINARY_ENV, STORAGE_PROVIDER: "cloudinary" }, () => {
        configureDocumentStorageFromEnv();
        const s3 = getDocumentStorageProvider("s3");
        const cloudinary = getDocumentStorageProvider("cloudinary");
        assert.ok(s3);
        assert.ok(cloudinary);
        assert.notEqual(s3, cloudinary);
    });
});
