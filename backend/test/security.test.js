import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import request from "supertest";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret-that-is-long-enough-123";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-that-is-different-456";
process.env.CORS_ORIGINS = "http://localhost:3000";
process.env.MONGO_URI = "mongodb://127.0.0.1:27017/schoolflow-test";

const { default: app } = await import("../src/app.js");
const { getConfig } = await import("../src/config/env.js");
const { createCsrfToken } = await import("../src/middleware/csrf.middleware.js");
const { authCookieNames } = await import("../src/security/auth-cookies.js");
const { createRateLimitStore } = await import("../src/services/rate-limit-store.js");
const { validateMongoTestUri } = await import("../src/testing/mongo-test-safety.js");
const { default: RefreshSession } = await import("../src/models/refresh-session.model.js");
const { default: User } = await import("../src/models/user.model.js");
const { default: School } = await import("../src/models/school.model.js");
const { default: mongoose } = await import("mongoose");

const origin = "http://localhost:3000";
const csrfToken = createCsrfToken();

test("cookie authentication rejects bearer tokens and enforces CSRF on login", async () => {
    const bearerToken = jwt.sign(
        { tokenType: "access" },
        process.env.JWT_ACCESS_SECRET,
        { subject: "64a000000000000000000001", jwtid: "bearer-only", expiresIn: "1m" }
    );
    await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${bearerToken}`)
        .expect(401);

    await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "person@example.test", password: "password" })
        .expect(403, {
            success: false,
            message: "Request origin is not allowed"
        });

    await request(app)
        .post("/api/v1/auth/login")
        .set("Origin", origin)
        .set("Cookie", `${authCookieNames.csrf}=${csrfToken}`)
        .send({ email: "person@example.test", password: "password" })
        .expect(403, {
            success: false,
            message: "CSRF token is invalid or missing"
        });

    await request(app)
        .post("/api/v1/academics/classes")
        .set("Cookie", `${authCookieNames.access}=${bearerToken}`)
        .send({ name: "Class 1", code: "C1" })
        .expect(403, {
            success: false,
            message: "Request origin is not allowed"
        });
});

test("CSRF bootstrap returns a signed token in a non-authentication cookie", async () => {
    const response = await request(app)
        .get("/api/v1/auth/csrf")
        .set("Origin", origin)
        .expect(200);
    assert.equal(typeof response.body.data.csrfToken, "string");
    const csrfCookie = response.headers["set-cookie"].find((value) =>
        value.startsWith(`${authCookieNames.csrf}=`)
    );
    assert.ok(csrfCookie);
    assert.match(csrfCookie, /SameSite=Lax/i);
    assert.doesNotMatch(csrfCookie, /HttpOnly/i);
});

test("successful login sets scoped HttpOnly cookies and never returns token values", async (t) => {
    const userId = "64a000000000000000000001";
    const schoolId = "64a000000000000000000002";
    const school = {
        _id: schoolId,
        status: "trial",
        subscription: { status: "trial", trialEndsAt: new Date(Date.now() + 60_000) }
    };
    const user = {
        _id: userId,
        schoolId,
        role: "school_admin",
        status: "active",
        name: "School Admin",
        email: "admin@example.test",
        verifyPassword: async (password) => password === "correct-password"
    };
    t.mock.method(School, "findOne", async () => school);
    t.mock.method(User, "findOne", () => ({ select: async () => user }));
    t.mock.method(RefreshSession.prototype, "save", async function saveSession() { return this; });

    const response = await request(app)
        .post("/api/v1/auth/login")
        .set("Origin", origin)
        .set("Cookie", `${authCookieNames.csrf}=${csrfToken}`)
        .set("X-CSRF-Token", csrfToken)
        .send({ schoolSlug: "test-school", email: user.email, password: "correct-password" })
        .expect(200);

    assert.equal(response.body.data.user.role, "school_admin");
    assert.equal("accessToken" in response.body.data, false);
    assert.equal("refreshToken" in response.body.data, false);
    const cookies = response.headers["set-cookie"];
    const accessCookie = cookies.find((value) => value.startsWith(`${authCookieNames.access}=`));
    const refreshCookie = cookies.find((value) => value.startsWith(`${authCookieNames.refresh}=`));
    assert.match(accessCookie, /HttpOnly/i);
    assert.match(accessCookie, /Path=\/api\/v1(?:;|$)/i);
    assert.match(refreshCookie, /HttpOnly/i);
    assert.match(refreshCookie, /Path=\/api\/v1\/auth(?:;|$)/i);
    assert.match(accessCookie, /SameSite=Lax/i);
});

test("all five roles can establish cookie-backed protected sessions", async (t) => {
    const userId = "64a000000000000000000011";
    const schoolId = "64a000000000000000000012";
    const school = {
        _id: schoolId,
        status: "trial",
        subscription: { status: "trial", trialEndsAt: new Date(Date.now() + 60_000) }
    };
    let activeRole = "school_admin";
    t.mock.method(RefreshSession, "findOne", async () => ({
        userId,
        schoolId: activeRole === "platform_super_admin" ? undefined : schoolId
    }));
    t.mock.method(User, "findById", async () => ({
        _id: userId,
        schoolId: activeRole === "platform_super_admin" ? undefined : schoolId,
        role: activeRole,
        status: "active",
        name: activeRole,
        email: `${activeRole}@example.test`
    }));
    t.mock.method(School, "findById", async () => school);

    for (const role of ["platform_super_admin", "school_admin", "principal", "teacher", "parent"]) {
        activeRole = role;
        const token = jwt.sign(
            { tokenType: "access" },
            process.env.JWT_ACCESS_SECRET,
            { subject: userId, jwtid: `session-${role}`, expiresIn: "1m" }
        );
        const response = await request(app)
            .get("/api/v1/auth/me")
            .set("Cookie", `${authCookieNames.access}=${token}`)
            .expect(200);
        assert.equal(response.body.data.user.role, role);
        assert.equal(response.body.data.user.schoolId, role === "platform_super_admin" ? null : schoolId);
    }
});

test("refresh endpoint rotates cookies and omits rotated tokens from JSON", async (t) => {
    const userId = "64a000000000000000000031";
    const schoolId = "64a000000000000000000032";
    const refreshId = "refresh-before-rotation";
    const refreshToken = jwt.sign(
        { tokenType: "refresh" },
        process.env.JWT_REFRESH_SECRET,
        { subject: userId, jwtid: refreshId, expiresIn: "1m" }
    );
    const user = {
        _id: userId,
        schoolId,
        role: "school_admin",
        status: "active",
        name: "School Admin",
        email: "admin@example.test"
    };
    const school = {
        _id: schoolId,
        status: "trial",
        subscription: { status: "trial", trialEndsAt: new Date(Date.now() + 60_000) }
    };
    const currentSession = {
        tokenId: refreshId,
        familyId: "refresh-family",
        tokenHash: createHash("sha256").update(refreshToken).digest("hex"),
        userId,
        schoolId,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        async save() {}
    };
    const transaction = {
        async withTransaction(callback) { await callback(); },
        async endSession() {}
    };
    const savedSessions = [];
    t.mock.method(mongoose, "startSession", async () => transaction);
    t.mock.method(RefreshSession, "findOne", (filter) => ({
        select() { return this; },
        async session() { return filter.tokenId === refreshId ? currentSession : null; }
    }));
    t.mock.method(RefreshSession.prototype, "save", async function saveSession() {
        savedSessions.push(this);
        return this;
    });
    t.mock.method(User, "findById", () => ({ async session() { return user; } }));
    t.mock.method(School, "findById", () => ({ async session() { return school; } }));

    const response = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Origin", origin)
        .set("Cookie", `${authCookieNames.refresh}=${refreshToken}; ${authCookieNames.csrf}=${csrfToken}`)
        .set("X-CSRF-Token", csrfToken)
        .expect(200);

    assert.ok(currentSession.revokedAt instanceof Date);
    assert.equal(savedSessions.length, 1);
    assert.equal(savedSessions[0].familyId, "refresh-family");
    assert.equal("accessToken" in response.body.data, false);
    assert.equal("refreshToken" in response.body.data, false);
    assert.equal(response.headers["set-cookie"].length, 2);
});

test("logout revokes a refresh session without an unexpired access cookie", async (t) => {
    const userId = "64a000000000000000000021";
    const refreshId = "refresh-to-logout";
    const refreshToken = jwt.sign(
        { tokenType: "refresh" },
        process.env.JWT_REFRESH_SECRET,
        { subject: userId, jwtid: refreshId, expiresIn: "1m" }
    );
    let revokedFilter;
    t.mock.method(RefreshSession, "updateOne", async (filter) => {
        revokedFilter = filter;
        return { modifiedCount: 1 };
    });

    const response = await request(app)
        .post("/api/v1/auth/logout")
        .set("Origin", origin)
        .set("Cookie", `${authCookieNames.refresh}=${refreshToken}; ${authCookieNames.csrf}=${csrfToken}`)
        .set("X-CSRF-Token", csrfToken)
        .expect(200);

    assert.equal(revokedFilter.tokenId, refreshId);
    assert.equal(revokedFilter.userId, userId);
    assert.equal(response.headers["set-cookie"].length, 2);
    assert.ok(response.headers["set-cookie"].every((cookie) =>
        /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i.test(cookie)
    ));
});

test("production rate limiting fails closed without shared storage", async () => {
    const store = createRateLimitStore({ redisUrl: "", nodeEnv: "production" });
    await assert.rejects(store.increment("client"), {
        statusCode: 503,
        message: "Shared rate limiting is temporarily unavailable"
    });
    assert.equal(createRateLimitStore({ redisUrl: "", nodeEnv: "test" }), undefined);
});

test("runtime configuration rejects missing and invalid NODE_ENV values", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    try {
        delete process.env.NODE_ENV;
        assert.throws(
            () => getConfig(),
            /NODE_ENV must be set to development, test, or production/
        );
        process.env.NODE_ENV = "prod";
        assert.throws(
            () => getConfig(),
            /NODE_ENV must be set to development, test, or production/
        );
        process.env.NODE_ENV = "test";
        assert.equal(getConfig().nodeEnv, "test");
    } finally {
        if (originalNodeEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = originalNodeEnv;
        }
    }
});

test("rate-limit middleware responds 503 when its shared store is unavailable", async () => {
    const express = (await import("express")).default;
    const rateLimit = (await import("express-rate-limit")).default;
    const store = createRateLimitStore({ redisUrl: "", nodeEnv: "production" });
    const limitedApp = express();
    limitedApp.use(rateLimit({ windowMs: 60_000, limit: 5, store }));
    limitedApp.use((error, req, res, next) => res.status(error.statusCode).json({ message: error.message }));
    await request(limitedApp)
        .get("/")
        .expect(503, { message: "Shared rate limiting is temporarily unavailable" });
});

test("Redis limiter adapter shares atomic counters and maps provider failures to 503", async () => {
    const commands = [];
    let totalHits = 0;
    const redisClientFactory = () => ({
        isReady: false,
        on() {},
        async connect() { this.isReady = true; },
        async sendCommand(command) {
            commands.push(command);
            if (command[0] === "SCRIPT") return "loaded-script";
            if (command[0] === "EVALSHA") return [++totalHits, 60_000];
            return "OK";
        }
    });
    const first = createRateLimitStore({
        redisUrl: "redis://test.invalid",
        nodeEnv: "test",
        redisClientFactory,
        prefix: "schoolflow:api:"
    });
    const second = createRateLimitStore({
        redisUrl: "redis://test.invalid",
        nodeEnv: "test",
        redisClientFactory,
        prefix: "schoolflow:auth:"
    });
    await first.init({ windowMs: 60_000 });
    await second.init({ windowMs: 60_000 });
    await first.increment("same-ip");
    await second.increment("same-ip");
    const evaluatedKeys = commands
        .filter((command) => command[0] === "EVALSHA")
        .map((command) => command[3]);
    assert.ok(evaluatedKeys.some((key) => key.startsWith("schoolflow:api:")));
    assert.ok(evaluatedKeys.some((key) => key.startsWith("schoolflow:auth:")));

    const unavailable = createRateLimitStore({
        redisUrl: "redis://test.invalid",
        nodeEnv: "test",
        redisClientFactory: () => ({
            isReady: false,
            on() {},
            async connect() { throw new Error("provider unavailable"); },
            async sendCommand() { throw new Error("not connected"); }
        })
    });
    await assert.rejects(unavailable.init({ windowMs: 60_000 }), { statusCode: 503 });
});

test("MongoDB integration URI guard validates isolated targets and remote acknowledgement", () => {
    const originalRemoteAcknowledgement = process.env.MONGO_TEST_ALLOW_REMOTE;
    try {
        delete process.env.MONGO_TEST_ALLOW_REMOTE;
        const localUri = "mongodb://127.0.0.1:27017/schoolflow_test_local";
        assert.equal(validateMongoTestUri(localUri), localUri);
        assert.throws(
            () => validateMongoTestUri("mongodb://127.0.0.1:27017/production"),
            /beginning with schoolflow_test/
        );
        assert.throws(
            () => validateMongoTestUri("mongodb://127.0.0.1:27017/schoolflow_test/extra"),
            /beginning with schoolflow_test/
        );
        assert.throws(
            () => validateMongoTestUri("mongodb://127.0.0.1:27017/schoolflow_test_bad$name"),
            /beginning with schoolflow_test/
        );
        assert.throws(
            () => validateMongoTestUri("https://db.example.test/schoolflow_test"),
            /mongodb:\/\/ or mongodb\+srv:\/\//
        );
        assert.throws(
            () => validateMongoTestUri("not-a-mongodb-uri"),
            /valid MongoDB URI/
        );

        const remoteUri = "mongodb+srv://cluster.example.test/schoolflow_test";
        assert.throws(() => validateMongoTestUri(remoteUri), /MONGO_TEST_ALLOW_REMOTE/);
        process.env.MONGO_TEST_ALLOW_REMOTE = "TRUE";
        assert.throws(() => validateMongoTestUri(remoteUri), /MONGO_TEST_ALLOW_REMOTE/);
        process.env.MONGO_TEST_ALLOW_REMOTE = "true";
        assert.equal(validateMongoTestUri(remoteUri), remoteUri);

        const replicaSetUri =
            "mongodb://mongo-a.example.test:27017,mongo-b.example.test:27017/schoolflow_test_replica";
        assert.equal(validateMongoTestUri(replicaSetUri), replicaSetUri);
    } finally {
        if (originalRemoteAcknowledgement === undefined) {
            delete process.env.MONGO_TEST_ALLOW_REMOTE;
        } else {
            process.env.MONGO_TEST_ALLOW_REMOTE = originalRemoteAcknowledgement;
        }
    }
});
