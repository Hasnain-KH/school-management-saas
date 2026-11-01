import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.MONGO_URI = "mongodb://127.0.0.1:27017/schoolflow-test";

const { default: mongoose } = await import("mongoose");
const { default: app } = await import("../src/app.js");
const { default: SubscriptionPlan } = await import("../src/models/subscription-plan.model.js");
const { default: AccountActionToken } = await import("../src/models/account-action-token.model.js");
const { default: School } = await import("../src/models/school.model.js");
const { default: User } = await import("../src/models/user.model.js");
const { default: AuditLog } = await import("../src/models/audit-log.model.js");
const { default: RefreshSession } = await import("../src/models/refresh-session.model.js");
const { requirePlanFeature, hasPermission } =
    await import("../src/middleware/authorization.middleware.js");
const { assertPlanCapacity } = await import("../src/utils/plan-limits.js");
const { planCreateSchema, planUpdateSchema, schoolSubscriptionSchema } =
    await import("../src/validators/platform.validator.js");
const { passwordRecoverySchema, passwordResetSchema } =
    await import("../src/validators/auth.validator.js");
const {
    completeAccountAction,
    requestPasswordRecovery
} = await import("../src/services/account-security.service.js");
const {
    configureEmailDeliveryProvider,
    getEmailDeliveryProvider
} = await import("../src/services/email-delivery.provider.js");
const {
    createSubscriptionPlan,
    updateSchoolStatus,
    updateSchoolSubscription
} = await import("../src/services/platform.service.js");
const { registerSchool } = await import("../src/services/auth.service.js");
const {
    getAcademicStatistics,
    getFinancialStatistics
} = await import("../src/services/reports.service.js");

const validPlan = {
    name: "Flexible",
    code: "Flexible-Plan",
    priceMinor: 12500,
    currency: "usd",
    billingInterval: "monthly",
    trialDurationDays: null,
    limits: { students: 300, staff: 25, branches: 4 },
    features: { students: true, academics: true, reports: true },
    isActive: true,
    isDefaultTrial: false
};

const mockTransaction = (t) => t.mock.method(mongoose, "startSession", async () => ({
    withTransaction: async (operation) => operation(),
    endSession: async () => {}
}));

test("subscription plan schemas accept configurable limits and reject invalid plan fields", async () => {
    const parsed = planCreateSchema.parse({ ...validPlan });
    assert.equal(parsed.code, "flexible-plan");
    assert.equal(parsed.currency, "USD");
    assert.equal(parsed.limits.students, 300);
    assert.equal(parsed.features.reports, true);
    assert.equal(planCreateSchema.safeParse({
        ...validPlan,
        limits: { ...validPlan.limits, students: 0 }
    }).success, false);
    assert.equal(planUpdateSchema.safeParse({ code: "another-plan" }).success, false);
    assert.equal(schoolSubscriptionSchema.safeParse({
        planId: "64a000000000000000000001",
        status: "active"
    }).success, false);
    const invalidTrial = new SubscriptionPlan({
        ...validPlan,
        isDefaultTrial: true,
        trialDurationDays: null
    });
    await assert.rejects(invalidTrial.validate(), (error) =>
        Boolean(error.errors.trialDurationDays)
    );
});

test("school registration is blocked until a default trial plan is configured (mocked MongoDB)", async (t) => {
    t.mock.method(SubscriptionPlan, "findOne", async () => null);
    await assert.rejects(registerSchool({
        schoolName: "Example School",
        email: "admin@example.test",
        adminName: "School Admin",
        password: "A-longer-password-123"
    }), { statusCode: 503 });
});

test("platform plan administration is restricted to platform super admins", () => {
    assert.equal(hasPermission("platform_super_admin", "platform:manage"), true);
    assert.equal(hasPermission("school_admin", "platform:manage"), false);
    assert.equal(hasPermission("teacher", "platform:manage"), false);
});

test("subscription and action-token models declare tenant, expiry, uniqueness, and secret-hash constraints", () => {
    assert.equal(School.schema.path("subscription.planId").options.ref, "SubscriptionPlan");
    assert.ok(AccountActionToken.schema.path("schoolId"));
    assert.equal(AccountActionToken.schema.path("tokenHash").options.select, false);
    assert.ok(AccountActionToken.schema.indexes().some(([keys, options]) =>
        keys.expiresAt === 1 && options.expireAfterSeconds === 0
    ));
    assert.ok(SubscriptionPlan.schema.indexes().some(([keys, options]) =>
        keys.code === 1 && options.unique
    ));
    assert.ok(SubscriptionPlan.schema.indexes().some(([keys, options]) =>
        keys.isDefaultTrial === 1 && options.unique
    ));
    assert.equal(passwordRecoverySchema.safeParse({
        email: "student@example.test",
        schoolId: "64a000000000000000000002"
    }).success, false);
    assert.equal(passwordResetSchema.safeParse({
        token: "x".repeat(43),
        password: "A-longer-password-123"
    }).success, true);
});

test("plan feature middleware fails closed and only permits an explicitly included feature", async () => {
    const check = (req) => new Promise((resolve) => {
        requirePlanFeature("fees")(req, {}, (error) => resolve(error));
    });
    assert.equal((await check({ school: { _id: "school-a" } })).statusCode, 403);
    assert.equal((await check({
        school: { _id: "school-a" },
        subscriptionPlan: { features: { fees: false } }
    })).statusCode, 403);
    assert.equal(await check({
        school: { _id: "school-a" },
        subscriptionPlan: { features: { fees: true } }
    }), undefined);
});

test("platform admins can create a configured default trial plan and duplicate plan codes are conflicts (mocked MongoDB)", async (t) => {
    mockTransaction(t);
    let clearedDefault = false;
    let auditAction;
    t.mock.method(SubscriptionPlan, "updateMany", async (filter) => {
        clearedDefault = filter.isDefaultTrial === true;
        return { modifiedCount: 1 };
    });
    t.mock.method(SubscriptionPlan.prototype, "save", async function savePlan() {});
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() {
        auditAction = this.action;
    });

    const plan = await createSubscriptionPlan(
        { user: { _id: "64a000000000000000000002" } },
        { ...validPlan, isDefaultTrial: true, trialDurationDays: 14 }
    );
    assert.equal(clearedDefault, true);
    assert.equal(plan.trialDurationDays, 14);
    assert.equal(auditAction, "subscription_plan.created");
});

test("duplicate subscription-plan codes return a conflict without recording success (mocked MongoDB)", async (t) => {
    mockTransaction(t);
    t.mock.method(SubscriptionPlan, "updateMany", async () => ({ modifiedCount: 1 }));
    t.mock.method(SubscriptionPlan.prototype, "save", async function savePlan() {
        throw Object.assign(new Error("duplicate"), { code: 11000 });
    });
    await assert.rejects(createSubscriptionPlan(
        { user: { _id: "64a000000000000000000002" } },
        { ...validPlan, isDefaultTrial: true, trialDurationDays: 14 }
    ), { statusCode: 409 });
});

test("transactional plan capacity rejects full tenants using their database-backed usage", async (t) => {
    t.mock.method(School, "updateOne", async () => ({ modifiedCount: 1 }));
    t.mock.method(SubscriptionPlan, "findById", () => ({
        session() { return this; },
        lean: async () => ({ limits: { students: 2 } })
    }));
    t.mock.method((await import("../src/models/student.model.js")).default, "countDocuments", () => ({
        session: async () => 2
    }));
    const req = {
        school: { _id: "64a000000000000000000001" },
        subscriptionPlan: { _id: "64a000000000000000000010" }
    };
    await assert.rejects(
        assertPlanCapacity(req, {}, "students"),
        { statusCode: 409 }
    );
});

test("transactional capacity checks apply configurable staff and branch limits", async (t) => {
    let activeLimits = { staff: 3, branches: 1 };
    let activeCount = 0;
    t.mock.method(School, "updateOne", async () => ({ modifiedCount: 1 }));
    t.mock.method(SubscriptionPlan, "findById", () => ({
        session() { return this; },
        lean: async () => ({ limits: activeLimits })
    }));
    t.mock.method(User, "countDocuments", () => ({ session: async () => activeCount }));
    t.mock.method(School, "findById", () => ({
        session() { return this; },
        select: async () => ({ branches: Array.from({ length: activeCount }) })
    }));
    const req = {
        school: { _id: "64a000000000000000000001" },
        subscriptionPlan: { _id: "64a000000000000000000010" }
    };

    activeCount = 3;
    await assert.rejects(assertPlanCapacity(req, {}, "staff"), { statusCode: 409 });
    activeCount = 1;
    await assert.rejects(assertPlanCapacity(req, {}, "branches"), { statusCode: 409 });
});

test("password recovery refuses to claim delivery or persist tokens without a configured provider", async () => {
    assert.throws(getEmailDeliveryProvider, { statusCode: 503 });
    await assert.rejects(
        requestPasswordRecovery({ email: "user@example.test", schoolSlug: "sample-school" }),
        { statusCode: 503 }
    );
});

test("account delivery and platform management routes fail closed without providers or admin authentication", async () => {
    const recovery = await request(app)
        .post("/api/v1/auth/password-recovery")
        .send({ email: "user@example.test", schoolSlug: "sample-school" })
        .expect(503);
    assert.equal(JSON.stringify(recovery.body).includes("token"), false);
    await request(app)
        .post("/api/v1/auth/email-verification")
        .send({ email: "user@example.test", schoolSlug: "sample-school" })
        .expect(503);
    await request(app).get("/api/v1/platform/plans").expect(401);
});

test("password recovery sends only through a provider and stores a hash, never a response token (mocked provider)", async (t) => {
    const schoolId = "64a000000000000000000001";
    const user = { _id: "64a000000000000000000002", schoolId, email: "user@example.test" };
    let storedToken;
    let delivered;
    t.mock.method(School, "findOne", (filter) => {
        assert.deepEqual(filter, { slug: "sample-school" });
        return {
        select: async () => ({ _id: schoolId })
        };
    });
    t.mock.method(User, "findOne", async (filter) => {
        assert.deepEqual(filter, { schoolId, email: user.email, status: "active" });
        return user;
    });
    t.mock.method(AccountActionToken, "updateMany", async () => ({ modifiedCount: 0 }));
    t.mock.method(AccountActionToken, "create", async (record) => {
        storedToken = record;
        return { _id: "64a000000000000000000003" };
    });
    configureEmailDeliveryProvider({
        async sendPasswordReset(message) { delivered = message; },
        async sendEmailVerification() {}
    });

    const result = await requestPasswordRecovery({
        email: user.email,
        schoolSlug: "sample-school"
    });
    assert.equal(result.message.includes(delivered.token), false);
    assert.equal(storedToken.tokenHash, createHash("sha256").update(delivered.token).digest("hex"));
    assert.equal(storedToken.schoolId, schoolId);
    assert.equal(storedToken.expiresAt > new Date(), true);
    assert.equal(delivered.email, user.email);
});

test("password reset consumes a hashed token and revokes existing sessions atomically (mocked MongoDB)", async (t) => {
    mockTransaction(t);
    const rawToken = "x".repeat(43);
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
    t.mock.method(User, "findById", () => ({
        session: async () => user
    }));
    t.mock.method(User.prototype, "save", async function saveUser() {});
    t.mock.method(RefreshSession, "updateMany", async (filter) => {
        refreshFilter = filter;
        return { modifiedCount: 1 };
    });
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() {});

    await completeAccountAction("password_reset", rawToken, "A-longer-password-123");
    assert.equal(tokenFilter.tokenHash, createHash("sha256").update(rawToken).digest("hex"));
    assert.equal(tokenFilter.expiresAt.$gt instanceof Date, true);
    assert.equal(refreshFilter.userId, user._id);
    assert.equal(user.passwordHash, "A-longer-password-123");
});

test("email-verification token updates the account only once (mocked MongoDB)", async (t) => {
    mockTransaction(t);
    const user = {
        _id: "64a000000000000000000002",
        role: "school_admin",
        status: "active",
        emailVerifiedAt: null,
        save: async () => {}
    };
    t.mock.method(AccountActionToken, "findOneAndUpdate", () => ({
        session: async () => ({ userId: user._id, schoolId: null })
    }));
    t.mock.method(User, "findById", () => ({ session: async () => user }));
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() {});
    await completeAccountAction("email_verification", "x".repeat(43));
    assert.equal(user.emailVerifiedAt instanceof Date, true);
});

test("platform subscription assignment applies plan data, lifecycle status, and school isolation (mocked MongoDB)", async (t) => {
    mockTransaction(t);
    const schoolId = "64a000000000000000000001";
    const planId = "64a000000000000000000010";
    const school = {
        _id: schoolId,
        status: "suspended",
        subscription: { status: "past_due", plan: "old-plan" },
        toObject() { return this; },
        save: async () => {}
    };
    const plan = {
        _id: planId,
        code: "configured-plan",
        isDefaultTrial: false
    };
    let schoolQuery;
    let planQuery;
    t.mock.method(School, "findById", (id) => {
        schoolQuery = String(id);
        return { session: async () => school };
    });
    t.mock.method(SubscriptionPlan, "findOne", (filter) => {
        planQuery = filter;
        return { session: async () => plan };
    });
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() {});
    await updateSchoolSubscription(
        { user: { _id: "64a000000000000000000002" } },
        schoolId,
        {
            planId,
            status: "active",
            currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString()
        }
    );
    assert.equal(schoolQuery, schoolId);
    assert.deepEqual(planQuery, { _id: planId, isActive: true });
    assert.equal(school.subscription.planId, planId);
    assert.equal(school.subscription.plan, "configured-plan");
    assert.equal(school.status, "active");
});

test("suspending a school revokes its persisted sessions (mocked MongoDB)", async (t) => {
    mockTransaction(t);
    const school = {
        _id: "64a000000000000000000001",
        status: "active",
        subscription: { status: "active" },
        save: async () => {},
        toObject() { return this; }
    };
    let revokedFilter;
    t.mock.method(School, "findById", () => ({ session: async () => school }));
    t.mock.method(RefreshSession, "updateMany", async (filter) => {
        revokedFilter = filter;
        return { modifiedCount: 1 };
    });
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() {});
    await updateSchoolStatus(
        { user: { _id: "64a000000000000000000002" } },
        school._id,
        "suspended"
    );
    assert.equal(school.status, "suspended");
    assert.equal(revokedFilter.schoolId, school._id);
});

test("academic and financial reports aggregate only authenticated tenant records (mocked MongoDB)", async (t) => {
    const schoolId = "64a000000000000000000001";
    const academicModels = [
        "academic-session.model.js",
        "academic-class.model.js",
        "section.model.js",
        "class-subject.model.js",
        "exam.model.js"
    ];
    for (const file of academicModels) {
        const { default: Model } = await import(`../src/models/${file}`);
        t.mock.method(Model, "aggregate", async (pipeline) => {
            assert.equal(pipeline[0].$match.schoolId, schoolId);
            return [];
        });
    }
    const reportReq = { user: { schoolId }, school: { _id: schoolId } };
    const academic = await getAcademicStatistics(reportReq);
    assert.equal(academic.activeClasses, 0);

    const { default: FeePayment } = await import("../src/models/fee-payment.model.js");
    const { default: FeeVoucher } = await import("../src/models/fee-voucher.model.js");
    t.mock.method(FeePayment, "aggregate", async ([match]) => {
        assert.equal(match.$match.schoolId, schoolId);
        return [];
    });
    t.mock.method(FeeVoucher, "aggregate", async ([match]) => {
        assert.equal(match.$match.schoolId, schoolId);
        return [];
    });
    const financial = await getFinancialStatistics(reportReq, {
        from: "2026-01-01",
        to: "2026-01-31"
    });
    assert.deepEqual(financial.collections, []);
    assert.deepEqual(financial.outstanding, []);
});
