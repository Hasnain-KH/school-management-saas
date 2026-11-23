import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getStorageUploadOrigins } from "../src/config/env.js";

const restoreUploadOrigins = (t) => {
    const previous = process.env.STORAGE_UPLOAD_ORIGINS;
    t.after(() => {
        if (previous === undefined) delete process.env.STORAGE_UPLOAD_ORIGINS;
        else process.env.STORAGE_UPLOAD_ORIGINS = previous;
    });
};

test("unset or empty STORAGE_UPLOAD_ORIGINS yields no origins", (t) => {
    restoreUploadOrigins(t);

    delete process.env.STORAGE_UPLOAD_ORIGINS;
    assert.deepEqual(getStorageUploadOrigins(), []);

    process.env.STORAGE_UPLOAD_ORIGINS = "   ,  ,";
    assert.deepEqual(getStorageUploadOrigins(), []);
});

test("valid upload origins are trimmed, normalized, and deduped", (t) => {
    restoreUploadOrigins(t);
    process.env.STORAGE_UPLOAD_ORIGINS = [
        " https://Uploads.Example.com ",
        "http://localhost:3000/",
        "https://uploads.example.com",
        "https://cdn.example.com:443",
        "http://insecure.example.com:80"
    ].join(",");

    assert.deepEqual(getStorageUploadOrigins(), [
        "https://uploads.example.com",
        "http://localhost:3000",
        "https://cdn.example.com",
        "http://insecure.example.com"
    ]);
});

test("invalid upload origin entries are ignored without failing open", (t) => {
    restoreUploadOrigins(t);
    process.env.STORAGE_UPLOAD_ORIGINS = [
        "javascript:alert(1)",
        "*",
        "https://example.com/foo",
        "https://user:pass@example.com",
        "ftp://example.com",
        "//example.com",
        "not a url",
        "https://example.com?token=1",
        "https://example.com#section",
        "https://valid.example.com"
    ].join(",");

    assert.deepEqual(getStorageUploadOrigins(), ["https://valid.example.com"]);
});

test("app factory adds configured upload origins to CSP connect-src", () => {
    const appFactoryPath = fileURLToPath(new URL("../src/app-factory.js", import.meta.url));
    const source = readFileSync(appFactoryPath, "utf8");

    assert.match(
        source,
        /import\s*\{[^}]*getStorageUploadOrigins[^}]*\}\s*from\s*["']\.\/config\/env\.js["']/
    );
    const connectSrc = source.split("\n").find((line) => line.includes("connectSrc:"));
    assert.ok(connectSrc, "connectSrc directive must exist");
    assert.match(connectSrc, /\.\.\.getStorageUploadOrigins\(\)/);
});
