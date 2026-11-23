import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createApp } from "../src/app-factory.js";

const app = createApp({ rateLimitOptions: { nodeEnv: "test" } });

test("API responses carry a safe correlation ID", async () => {
    const echoed = await request(app).get("/api/v1/health").set("x-request-id", "trace-123");
    assert.equal(echoed.headers["x-request-id"], "trace-123");

    const generated = await request(app).get("/api/v1/health");
    assert.match(generated.headers["x-request-id"], /^[A-Za-z0-9._-]{1,64}$/);

    const rejected = await request(app).get("/api/v1/health").set("x-request-id", "unsafe value!");
    assert.notEqual(rejected.headers["x-request-id"], "unsafe value!");
    assert.match(rejected.headers["x-request-id"], /^[A-Za-z0-9._-]{1,64}$/);
});
