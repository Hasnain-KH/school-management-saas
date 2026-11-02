import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import request from "supertest";
import { createClient } from "redis";

const enabled = process.env.SCHOOLFLOW_REDIS_INTEGRATION === "true";
const redisUrl = process.env.RATE_LIMIT_REDIS_TEST_URL;

test("SchoolFlow API and authentication limiters use shared Redis and fail closed", {
    skip: enabled ? false : "Set SCHOOLFLOW_REDIS_INTEGRATION=true to opt in"
}, async (t) => {
    assert.ok(redisUrl, "RATE_LIMIT_REDIS_TEST_URL must identify a dedicated non-production Redis database");
    assert.notEqual(process.env.NODE_ENV, "production", "Redis integration tests cannot run with NODE_ENV=production");

    let parsedUrl;
    try {
        parsedUrl = new URL(redisUrl);
    } catch {
        throw new Error("RATE_LIMIT_REDIS_TEST_URL must be a valid Redis URL");
    }
    if (!["redis:", "rediss:"].includes(parsedUrl.protocol)) {
        throw new Error("RATE_LIMIT_REDIS_TEST_URL must use redis:// or rediss://");
    }
    if (process.env.RATE_LIMIT_REDIS_URL) {
        let productionUrl;
        try {
            productionUrl = new URL(process.env.RATE_LIMIT_REDIS_URL);
        } catch {
            throw new Error("Unable to verify the test Redis endpoint is separate from production");
        }
        const testPort = parsedUrl.port || "6379";
        const productionPort = productionUrl.port || "6379";
        if (
            parsedUrl.hostname.toLowerCase() === productionUrl.hostname.toLowerCase()
            && testPort === productionPort
        ) {
            throw new Error("The integration test must use a separate Redis endpoint from production");
        }
    }
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
    if (!loopbackHosts.has(parsedUrl.hostname.toLowerCase()) && parsedUrl.protocol !== "rediss:") {
        throw new Error("Remote test Redis must use TLS");
    }

    const environmentKeys = [
        "DOTENV_CONFIG_PATH",
        "NODE_ENV",
        "JWT_ACCESS_SECRET",
        "JWT_REFRESH_SECRET",
        "CORS_ORIGINS",
        "MONGO_URI"
    ];
    const originalEnvironment = new Map(
        environmentKeys.map((key) => [key, process.env[key]])
    );
    const clients = [];
    let cleanupClient;
    const testNamespace = `redis-integration:${randomUUID()}`;
    const keyNamespace = `schoolflow:${testNamespace}:`;

    const restoreEnvironment = () => {
        for (const [key, value] of originalEnvironment) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    };

    try {
        process.env.DOTENV_CONFIG_PATH = "unused-redis-integration-environment-file.env";
        process.env.NODE_ENV = "test";
        process.env.JWT_ACCESS_SECRET = "redis-integration-access-secret-for-tests-only";
        process.env.JWT_REFRESH_SECRET = "redis-integration-refresh-secret-for-tests-only";
        process.env.CORS_ORIGINS = "http://localhost:3000";
        process.env.MONGO_URI = "mongodb://127.0.0.1:27017/schoolflow-test";

        const { createApp } = await import("../src/app-factory.js");
        const redisClientFactory = (options) => {
            const client = createClient(options);
            client.on("error", () => {});
            clients.push(client);
            return client;
        };
        const makeApp = (namespace, url = redisUrl) => createApp({
            rateLimitOptions: {
                redisUrl: url,
                nodeEnv: "test",
                namespace,
                redisClientFactory
            }
        });

        cleanupClient = createClient({
            url: redisUrl,
            socket: {
                reconnectStrategy: (retries) => retries < 2 ? 100 : false
            }
        });
        cleanupClient.on("error", () => {});
        await cleanupClient.connect();

        await t.test("API limiter shares the configured 300-request window across app instances", async () => {
            const firstApp = makeApp(`${testNamespace}:api`);
            const secondApp = makeApp(`${testNamespace}:api`);

            for (let hit = 0; hit < 300; hit += 1) {
                const app = hit % 2 === 0 ? firstApp : secondApp;
                await request(app).get("/api/v1/auth/csrf").expect(200);
            }
            await request(secondApp)
                .get("/api/v1/auth/csrf")
                .expect(429);
        });

        await t.test("authentication limiter shares its configured 10-request window across app instances", async () => {
            const firstApp = makeApp(`${testNamespace}:auth`);
            const secondApp = makeApp(`${testNamespace}:auth`);

            for (let hit = 0; hit < 10; hit += 1) {
                const app = hit % 2 === 0 ? firstApp : secondApp;
                await request(app)
                    .post("/api/v1/auth/password-recovery")
                    .send({})
                    .expect(400);
            }
            await request(secondApp)
                .post("/api/v1/auth/password-recovery")
                .send({})
                .expect(429, {
                    success: false,
                    message: "Too many authentication attempts; try again later"
                });
        });

        await t.test("unavailable Redis returns the application's 503 response", async () => {
            const unavailableApp = makeApp(
                `${testNamespace}:unavailable`,
                "redis://127.0.0.1:1"
            );
            await request(unavailableApp)
                .get("/api/v1/auth/csrf")
                .expect(503, {
                    success: false,
                    message: "An unexpected server error occurred"
                });
        });
    } finally {
        try {
            if (cleanupClient?.isReady) {
                for await (const keys of cleanupClient.scanIterator({
                    MATCH: `${keyNamespace}*`,
                    COUNT: 100
                })) {
                    const ownedKeys = keys.filter((key) => key.startsWith(keyNamespace));
                    if (ownedKeys.length > 0) {
                        await cleanupClient.del(ownedKeys);
                    }
                }
            }
        } finally {
            cleanupClient?.destroy();
            for (const client of clients) {
                client.destroy();
            }
            restoreEnvironment();
        }
    }
});
