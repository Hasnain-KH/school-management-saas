import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret-that-is-long-enough-123";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-that-is-different-456";
process.env.CORS_ORIGINS = "http://localhost:3000";
process.env.MONGO_URI = "mongodb://127.0.0.1:27017/schoolflow-test";
// Dummy (non-secret) values so getConfig's mandatory-verification guard can be
// exercised. configureEmailDeliveryFromEnv() is never called in tests; delivery
// is injected with configureEmailDeliveryProvider below.
process.env.EMAIL_API_KEY = "test-email-api-key";
process.env.EMAIL_FROM = "SchoolFlow <no-reply@example.test>";

const { default: mongoose } = await import("mongoose");
const { default: app } = await import("../src/app.js");
const { default: SubscriptionPlan } = await import("../src/models/subscription-plan.model.js");
const { default: AccountActionToken } = await import("../src/models/account-action-token.model.js");
const { default: School } = await import("../src/models/school.model.js");
const { default: User } = await import("../src/models/user.model.js");
const { default: AuditLog } = await import("../src/models/audit-log.model.js");
const { default: RefreshSession } = await import("../src/models/refresh-session.model.js");
const { getConfig, isEmailVerificationRequired } = await import("../src/config/env.js");
const { createCsrfToken } = await import("../src/middleware/csrf.middleware.js");
const {
    configureEmailDeliveryProvider
} = await import("../src/services/email-delivery.provider.js");
const {
    requiresEmailVerification,
    shouldMarkNewAccountsForVerification
} = await import("../src/services/email-verification.policy.js");
const {
    completeAccountAction,
    requestEmailVerification
} = await import("../src/services/account-security.service.js");
const { registerSchool, login } = await import("../src/services/auth.service.js");
const { createUser } = await import("../src/services/user.service.js");

const origin = "http://localhost:3000";
const csrfToken = createCsrfToken();

const mockTransaction = (t) => t.mock.method(mongoose, "startSession", async () => ({
    withTransaction: async (operation) => operation(),
    endSession: async () => {}
}));

const activeSchool = (schoolId) => ({
    _id: schoolId,
    slug: "sample-school",
    status: "trial",
    subscription: { status: "trial", trialEndsAt: new Date(Date.now() + 60_000) }
});

const mockTrialPlan = (t) => t.mock.method(SubscriptionPlan, "findOne", async () => ({
    _id: "64a000000000000000000010",
    code: "trial",
    trialDurationDays: 14
}));

// ---------------------------------------------------------------------------
// Policy semantics
// ---------------------------------------------------------------------------

test("the verification gate blocks only explicitly-marked, unverified, non-platform accounts", () => {
    assert.equal(requiresEmailVerification({
        role: "teacher",
        emailVerificationRequired: true,
        emailVerifiedAt: null
    }), true);
    assert.equal(requiresEmailVerification({
        role: "school_admin",
        emailVerificationRequired: true,
        emailVerifiedAt: new Date()
    }), false);
    assert.equal(requiresEmailVerification({
        role: "parent",
        emailVerificationRequired: false,
        emailVerifiedAt: null
    }), false);
    // Legacy record: no marker at all must remain accessible.
    assert.equal(requiresEmailVerification({ role: "teacher" }), false);
    // Platform super admins are never locked out.
    assert.equal(requiresEmailVerification({
        role: "platform_super_admin",
        emailVerificationRequired: true,
        emailVerifiedAt: null
    }), false);
});

test("the policy flag defaults off and never turns on implicitly", () => {
    const original = process.env.REQUIRE_EMAIL_VERIFICATION;
    try {
        delete process.env.REQUIRE_EMAIL_VERIFICATION;
        assert.equal(isEmailVerificationRequired(), false);
        process.env.REQUIRE_EMAIL_VERIFICATION = "TRUE";
        assert.equal(isEmailVerificationRequired(), false);
        process.env.REQUIRE_EMAIL_VERIFICATION = "true";
        assert.equal(isEmailVerificationRequired(), true);
    } finally {
        if (original === undefined) delete process.env.REQUIRE_EMAIL_VERIFICATION;
        else process.env.REQUIRE_EMAIL_VERIFICATION = original;
    }
});

test("mandatory verification fails configuration without an email provider", () => {
    const originalVerification = process.env.REQUIRE_EMAIL_VERIFICATION;
    const originalKey = process.env.EMAIL_API_KEY;
    const originalFrom = process.env.EMAIL_FROM;
    try {
        process.env.REQUIRE_EMAIL_VERIFICATION = "true";
        assert.equal(getConfig().requireEmailVerification, true);
        delete process.env.EMAIL_API_KEY;
        delete process.env.EMAIL_FROM;
        assert.throws(
            () => getConfig(),
            /REQUIRE_EMAIL_VERIFICATION requires EMAIL_API_KEY and EMAIL_FROM/
        );
        process.env.EMAIL_API_KEY = originalKey;
        process.env.EMAIL_FROM = originalFrom;
    } finally {
        if (originalVerification === undefined) delete process.env.REQUIRE_EMAIL_VERIFICATION;
        else process.env.REQUIRE_EMAIL_VERIFICATION = originalVerification;
    }
});

// ---------------------------------------------------------------------------
// Fail-closed behaviour before a provider is configured (runs first)
// ---------------------------------------------------------------------------

test("verification requests fail closed and reveal nothing without a provider", async () => {
    await assert.rejects(
        requestEmailVerification({ email: "user@example.test", schoolSlug: "sample-school" }),
        { statusCode: 503 }
    );
    const response = await request(app)
        .post("/api/v1/auth/email-verification")
        .set("Origin", origin)
        .send({ email: "user@example.test", schoolSlug: "sample-school" })
        .expect(503);
    assert.equal(JSON.stringify(response.body).includes("token"), false);
});

// ---------------------------------------------------------------------------
// Provider configured from here on
// ---------------------------------------------------------------------------

test("new accounts are marked for verification only when the policy is on and a provider exists", () => {
    let delivered;
    configureEmailDeliveryProvider({
        async sendPasswordReset() {},
        async sendEmailVerification(message) { delivered = message; }
    });
    assert.equal(typeof delivered, "undefined");

    const original = process.env.REQUIRE_EMAIL_VERIFICATION;
    try {
        delete process.env.REQUIRE_EMAIL_VERIFICATION;
        assert.equal(shouldMarkNewAccountsForVerification(), false);
        process.env.REQUIRE_EMAIL_VERIFICATION = "true";
        assert.equal(shouldMarkNewAccountsForVerification(), true);
    } finally {
        if (original === undefined) delete process.env.REQUIRE_EMAIL_VERIFICATION;
        else process.env.REQUIRE_EMAIL_VERIFICATION = original;
    }
});

test("registration with mandatory verification withholds sessions, marks the account, and emails a link", async (t) => {
    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    try {
        mockTrialPlan(t);
        mockTransaction(t);
        let savedUser;
        let sessionSaves = 0;
        t.mock.method(School.prototype, "save", async function saveSchool() { return this; });
        t.mock.method(User.prototype, "save", async function saveUser() { savedUser = this; return this; });
        t.mock.method(AuditLog.prototype, "save", async function saveAudit() { return this; });
        t.mock.method(RefreshSession.prototype, "save", async function saveSession() {
            sessionSaves += 1;
            return this;
        });
        // Lookups used by the post-commit resend flow.
        t.mock.method(School, "findOne", () => ({ select: async () => ({ _id: savedUser.schoolId }) }));
        t.mock.method(User, "findOne", async () => savedUser);
        t.mock.method(AccountActionToken, "updateMany", async () => ({ modifiedCount: 0 }));
        let storedToken;
        t.mock.method(AccountActionToken, "create", async (record) => {
            storedToken = record;
            return { _id: "64a000000000000000000003" };
        });
        let delivered;
        configureEmailDeliveryProvider({
            async sendPasswordReset() {},
            async sendEmailVerification(message) { delivered = message; }
        });

        const result = await registerSchool({
            schoolName: "Example School",
            email: "admin@example.test",
            adminName: "School Admin",
            password: "A-longer-password-123",
            baseCurrency: "USD",
            currencyConfirmed: true
        });

        assert.equal(result.emailVerificationRequired, true);
        assert.equal("accessToken" in result, false);
        assert.equal("refreshToken" in result, false);
        assert.equal(savedUser.emailVerificationRequired, true);
        assert.equal(sessionSaves, 0);
        assert.ok(delivered);
        assert.equal(delivered.email, "admin@example.test");
        assert.equal(storedToken.tokenHash, createHash("sha256").update(delivered.token).digest("hex"));
        assert.equal(JSON.stringify(result).includes(delivered.token), false);
    } finally {
        delete process.env.REQUIRE_EMAIL_VERIFICATION;
    }
});

test("registration without mandatory verification still issues an authenticated session", async (t) => {
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
    mockTrialPlan(t);
    mockTransaction(t);
    let savedUser;
    let sessionSaves = 0;
    t.mock.method(School.prototype, "save", async function saveSchool() { return this; });
    t.mock.method(User.prototype, "save", async function saveUser() { savedUser = this; return this; });
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() { return this; });
    t.mock.method(RefreshSession.prototype, "save", async function saveSession() {
        sessionSaves += 1;
        return this;
    });

    const result = await registerSchool({
        schoolName: "Example School",
        email: "admin@example.test",
        adminName: "School Admin",
        password: "A-longer-password-123",
        baseCurrency: "USD",
        currencyConfirmed: true
    });

    assert.equal("accessToken" in result, true);
    assert.equal("refreshToken" in result, true);
    assert.equal(result.emailVerificationRequired, undefined);
    assert.equal(savedUser.emailVerificationRequired, false);
    assert.equal(sessionSaves, 1);
});

test("login blocks only marked-unverified accounts and never locks out legacy or verified users", async (t) => {
    const schoolId = "64a000000000000000000001";
    t.mock.method(School, "findOne", async () => activeSchool(schoolId));
    t.mock.method(RefreshSession.prototype, "save", async function saveSession() { return this; });
    let currentUser;
    t.mock.method(User, "findOne", () => ({ select: async () => currentUser }));
    const base = {
        _id: "64a000000000000000000002",
        schoolId,
        role: "teacher",
        status: "active",
        name: "Teacher",
        email: "teacher@example.test",
        verifyPassword: async (password) => password === "correct-password"
    };
    const credentials = { schoolSlug: "sample-school", email: base.email, password: "correct-password" };

    // Legacy unverified account (no marker) must still sign in.
    currentUser = { ...base };
    const legacy = await login({ ...credentials });
    assert.ok(legacy.accessToken);

    // Explicitly marked and unverified account is blocked.
    currentUser = { ...base, emailVerificationRequired: true, emailVerifiedAt: null };
    await assert.rejects(login({ ...credentials }), {
        statusCode: 403,
        message: "Email address verification is required"
    });

    // Marked and verified account signs in.
    currentUser = { ...base, emailVerificationRequired: true, emailVerifiedAt: new Date() };
    const verified = await login({ ...credentials });
    assert.ok(verified.accessToken);
});

test("resend requests are generic, store only a hash, and never return the token", async (t) => {
    const schoolId = "64a000000000000000000001";
    const user = {
        _id: "64a000000000000000000002",
        schoolId,
        email: "user@example.test",
        status: "active",
        emailVerifiedAt: null
    };
    t.mock.method(School, "findOne", () => ({ select: async () => ({ _id: schoolId }) }));
    t.mock.method(User, "findOne", async () => user);
    t.mock.method(AccountActionToken, "updateMany", async () => ({ modifiedCount: 0 }));
    let storedToken;
    t.mock.method(AccountActionToken, "create", async (record) => {
        storedToken = record;
        return { _id: "64a000000000000000000003" };
    });
    let delivered;
    configureEmailDeliveryProvider({
        async sendPasswordReset() {},
        async sendEmailVerification(message) { delivered = message; }
    });

    const result = await requestEmailVerification({ email: user.email, schoolSlug: "sample-school" });
    assert.equal(result.message.includes(delivered.token), false);
    assert.equal(storedToken.tokenHash, createHash("sha256").update(delivered.token).digest("hex"));
    assert.equal(storedToken.tokenHash === delivered.token, false);

    // An unknown account returns the same generic message and sends nothing.
    delivered = undefined;
    t.mock.method(User, "findOne", async () => null);
    const unknown = await requestEmailVerification({ email: "nobody@example.test", schoolSlug: "sample-school" });
    assert.equal(unknown.message, result.message);
    assert.equal(delivered, undefined);
});

// ---------------------------------------------------------------------------
// Confirmation endpoint
// ---------------------------------------------------------------------------

test("email-verification/confirm verifies once, rejects replays, and rejects invalid tokens", async (t) => {
    mockTransaction(t);
    const userId = "64a000000000000000000002";
    let user = { _id: userId, role: "school_admin", status: "active", emailVerifiedAt: null, save: async () => {} };
    let tokenResult = { userId, schoolId: null };
    t.mock.method(AccountActionToken, "findOneAndUpdate", async () => (tokenResult ? { session: async () => tokenResult } : null));
    t.mock.method(User, "findById", () => ({ session: async () => user }));
    t.mock.method(User.prototype, "save", async function saveUser() { return this; });
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() { return this; });
    const body = { token: "x".repeat(43) };

    const success = await request(app)
        .post("/api/v1/auth/email-verification/confirm")
        .set("Origin", origin)
        .send(body)
        .expect(200);
    assert.equal(success.body.message, "Email address verified");
    assert.equal(user.emailVerifiedAt instanceof Date, true);

    // Replaying the same link against an already-verified account is a conflict.
    const replay = await request(app)
        .post("/api/v1/auth/email-verification/confirm")
        .set("Origin", origin)
        .send(body)
        .expect(409);
    assert.equal(replay.body.success, false);

    // An expired/consumed/unknown token is a 400.
    tokenResult = null;
    await request(app)
        .post("/api/v1/auth/email-verification/confirm")
        .set("Origin", origin)
        .send(body)
        .expect(400);

    // A short token fails validation before reaching the handler.
    await request(app)
        .post("/api/v1/auth/email-verification/confirm")
        .set("Origin", origin)
        .send({ token: "short" })
        .expect(400);
});

test("email-verification/confirm enforces the origin allowlist", async () => {
    const denied = await request(app)
        .post("/api/v1/auth/email-verification/confirm")
        .set("Origin", "https://untrusted.example")
        .send({ token: "x".repeat(43) })
        .expect(403);
    assert.deepEqual(denied.body, {
        success: false,
        message: "Request origin is not allowed"
    });
});

// ---------------------------------------------------------------------------
// Staff / parent account creation
// ---------------------------------------------------------------------------

test("staff/parent creation marks and emails accounts only under the mandatory policy", async (t) => {
    const schoolId = "64a000000000000000000001";
    const req = {
        user: { _id: "64a000000000000000000009", schoolId },
        school: { _id: schoolId, slug: "sample-school" }
    };
    mockTransaction(t);
    let created;
    t.mock.method(User.prototype, "save", async function saveUser() { created = this; return this; });
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() { return this; });
    t.mock.method(School, "findOne", () => ({ select: async () => ({ _id: schoolId }) }));
    t.mock.method(User, "findOne", async () => created);
    t.mock.method(AccountActionToken, "updateMany", async () => ({ modifiedCount: 0 }));
    let storedToken;
    t.mock.method(AccountActionToken, "create", async (record) => {
        storedToken = record;
        return { _id: "64a000000000000000000003" };
    });
    let delivered;
    configureEmailDeliveryProvider({
        async sendPasswordReset() {},
        async sendEmailVerification(message) { delivered = message; }
    });

    delete process.env.REQUIRE_EMAIL_VERIFICATION;
    delivered = undefined;
    const off = await createUser(req, {
        name: "Parent One", email: "parent1@example.test", role: "parent", password: "A-longer-password-123"
    });
    assert.equal(off.emailVerificationRequired, false);
    assert.equal(delivered, undefined);

    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    try {
        const on = await createUser(req, {
            name: "Parent Two", email: "parent2@example.test", role: "parent", password: "A-longer-password-123"
        });
        assert.equal(on.emailVerificationRequired, true);
        assert.ok(delivered);
        assert.equal(delivered.email, "parent2@example.test");
        assert.equal(storedToken.tokenHash, createHash("sha256").update(delivered.token).digest("hex"));
    } finally {
        delete process.env.REQUIRE_EMAIL_VERIFICATION;
    }
});

// ---------------------------------------------------------------------------
// Password reset still revokes sessions (regression guard)
// ---------------------------------------------------------------------------

test("password reset saves the new hash through the model and revokes active sessions", async (t) => {
    mockTransaction(t);
    const rawToken = "y".repeat(43);
    const user = {
        _id: "64a000000000000000000002",
        role: "platform_super_admin",
        status: "active",
        save: async () => {}
    };
    let tokenFilter;
    let refreshFilter;
    t.mock.method(AccountActionToken, "findOneAndUpdate", (filter) => {
        tokenFilter = filter;
        return { session: async () => ({ userId: user._id, schoolId: null }) };
    });
    t.mock.method(User, "findById", () => ({ session: async () => user }));
    t.mock.method(User.prototype, "save", async function saveUser() { return this; });
    t.mock.method(RefreshSession, "updateMany", async (filter) => {
        refreshFilter = filter;
        return { modifiedCount: 1 };
    });
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() { return this; });

    await completeAccountAction("password_reset", rawToken, "A-longer-password-123");
    assert.equal(tokenFilter.tokenHash, createHash("sha256").update(rawToken).digest("hex"));
    assert.equal(tokenFilter.expiresAt.$gt instanceof Date, true);
    assert.deepEqual(refreshFilter, { userId: user._id, revokedAt: null });
    assert.equal(user.passwordHash, "A-longer-password-123");
});
