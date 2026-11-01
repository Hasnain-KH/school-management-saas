import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret-that-is-long-enough-123";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-that-is-different-456";
process.env.CORS_ORIGINS = "http://localhost:3000";
process.env.MONGO_URI = "mongodb://127.0.0.1:27017/schoolflow-test";

const { default: app } = await import("../src/app.js");
const { default: jwt } = await import("jsonwebtoken");
const { schoolRegistrationSchema, updateSchoolSchema } = await import("../src/validators/auth.validator.js");
const { hasPermission, requireTenant, tenantFilter } = await import(
    "../src/middleware/authorization.middleware.js"
);
const { default: School } = await import("../src/models/school.model.js");
const { default: User } = await import("../src/models/user.model.js");
const { default: RefreshSession } = await import("../src/models/refresh-session.model.js");
const { default: AuditLog } = await import("../src/models/audit-log.model.js");
const { default: mongoose } = await import("mongoose");
const { default: AcademicSession } = await import("../src/models/academic-session.model.js");
const { default: AcademicClass } = await import("../src/models/academic-class.model.js");
const { default: Section } = await import("../src/models/section.model.js");
const { default: Subject } = await import("../src/models/subject.model.js");
const { default: ClassSubject } = await import("../src/models/class-subject.model.js");
const { default: TimetableEntry } = await import("../src/models/timetable-entry.model.js");
const { default: Student } = await import("../src/models/student.model.js");
const { default: Guardian } = await import("../src/models/guardian.model.js");
const { default: StudentGuardian } = await import("../src/models/student-guardian.model.js");
const { default: StudentAcademicHistory } = await import("../src/models/student-academic-history.model.js");
const { default: StudentLeavingCertificate } = await import("../src/models/student-leaving-certificate.model.js");
const { default: StudentAttendance } = await import("../src/models/student-attendance.model.js");
const { default: StaffAttendance } = await import("../src/models/staff-attendance.model.js");
const { updateSchoolProfile } = await import("../src/services/school.service.js");
const {
    admitStudent,
    getStudent,
    issueLeavingCertificate,
    getLeavingCertificate,
    transitionStudentPlacement
} = await import("../src/services/student.service.js");
const {
    markStudentAttendance,
    markStaffAttendance,
    getMyStaffAttendanceMonth,
    getStaffAttendanceMonth
} = await import("../src/services/attendance.service.js");
const {
    studentAttendanceMarkSchema,
    staffAttendanceMarkSchema
} = await import("../src/validators/attendance.validator.js");
const { createUser } = await import("../src/services/user.service.js");
const {
    activateAcademicSession,
    createAcademicSession,
    createBranch,
    createSection,
    createTimetableEntry,
    updateClass
} = await import("../src/services/academic.service.js");
const { login, logout, refreshTokens, slugFromName } = await import("../src/services/auth.service.js");
const { durationInSeconds, getConfig } = await import("../src/config/env.js");

test("health and root routes return stable success responses", async () => {
    const health = await request(app).get("/api/v1/health").expect(200);
    assert.equal(health.body.success, true);
    assert.equal(health.body.data, null);

    const root = await request(app).get("/").expect(200);
    assert.equal(root.body.success, true);
    assert.equal(root.body.data, null);
});

test("API responses include security headers and enforce the CORS allowlist", async () => {
    const allowed = await request(app)
        .get("/api/v1/health")
        .set("Origin", "http://localhost:3000")
        .expect(200);
    assert.equal(allowed.headers["x-content-type-options"], "nosniff");
    assert.equal(allowed.headers["access-control-allow-origin"], "http://localhost:3000");

    const denied = await request(app)
        .get("/api/v1/health")
        .set("Origin", "https://untrusted.example")
        .expect(403);
    assert.deepEqual(denied.body, {
        success: false,
        message: "Request origin is not allowed"
    });
});

test("registration and school updates reject invalid and tenant-injected fields", async () => {
    const invalidRegistration = await request(app)
        .post("/api/v1/auth/register")
        .send({ schoolName: "Example School", schoolId: "other-school" })
        .expect(400);
    assert.equal(invalidRegistration.body.success, false);
    assert.equal(invalidRegistration.body.message, "Request validation failed");
    assert.ok(invalidRegistration.body.errors.length > 0);

    assert.equal(schoolRegistrationSchema.safeParse({
        schoolName: "Example School",
        email: "ADMIN@EXAMPLE.COM",
        adminName: "School Admin",
        password: "a-secure-password-123"
    }).success, true);
    assert.equal(schoolRegistrationSchema.safeParse({
        schoolName: "Example School",
        email: "admin@example.com",
        adminName: "School Admin",
        password: "a-secure-password-123",
        role: "platform_super_admin"
    }).success, false);
    assert.equal(updateSchoolSchema.safeParse({ schoolId: "another-school" }).success, false);
});

test("authentication errors and unknown routes use safe error envelopes", async () => {
    const auth = await request(app).get("/api/v1/auth/me").expect(401);
    assert.deepEqual(auth.body, {
        success: false,
        message: "Authentication is required"
    });

    const missing = await request(app).get("/api/v1/not-a-route").expect(404);
    assert.deepEqual(missing.body, {
        success: false,
        message: "The requested route was not found"
    });

    const expiredToken = jwt.sign(
        { tokenType: "access" },
        process.env.JWT_ACCESS_SECRET,
        { subject: "64a000000000000000000002", jwtid: "expired", expiresIn: -1 }
    );
    await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${expiredToken}`)
        .expect(401);
});

test("tenant filters cannot be overridden by a caller-provided school ID", () => {
    const req = {
        school: { _id: "school-a" },
        user: { schoolId: "school-a" }
    };

    assert.deepEqual(
        tenantFilter(req, { schoolId: "school-b", status: "active" }),
        { schoolId: "school-a", status: "active" }
    );
    assert.throws(() => tenantFilter({ user: { schoolId: "school-a" } }), {
        statusCode: 403
    });
    assert.equal(hasPermission("school_admin", "school:update"), true);
    assert.equal(hasPermission("teacher", "school:update"), false);
    assert.equal(hasPermission("teacher", "students:read"), false);
    assert.equal(hasPermission("parent", "students:read"), false);
    assert.equal(hasPermission("platform_super_admin", "school:update"), false);
    for (const role of ["school_admin", "principal", "teacher", "parent", "platform_super_admin"]) {
        assert.equal(hasPermission(role, "unknown:permission"), false);
    }
});

test("school tenant middleware rejects mismatched school context", async () => {
    let receivedError;
    requireTenant(
        { school: { _id: "school-a" }, user: { schoolId: "school-b" } },
        {},
        (error) => { receivedError = error; }
    );
    assert.equal(receivedError.statusCode, 403);
});

test("authenticated school profile reads use only the authenticated tenant ID", async (t) => {
    const schoolId = "64a000000000000000000001";
    const userId = "64a000000000000000000002";
    const school = {
        _id: schoolId,
        name: "School A",
        slug: "school-a",
        status: "trial",
        email: "admin@school-a.example",
        subscription: { status: "trial", trialEndsAt: new Date(Date.now() + 60_000) },
        branches: [],
        settings: { attendanceLateGraceMinutes: 10 }
    };
    const user = {
        _id: userId,
        schoolId,
        role: "school_admin",
        status: "active",
        name: "School A Admin",
        email: "admin@school-a.example"
    };
    const persistedSession = { userId, schoolId };
    const schoolLookups = [];

    t.mock.method(RefreshSession, "findOne", async () => persistedSession);
    t.mock.method(User, "findById", async () => user);
    t.mock.method(School, "findById", async (id) => {
        schoolLookups.push(String(id));
        return String(id) === schoolId ? school : null;
    });

    const accessToken = jwt.sign(
        { tokenType: "access" },
        process.env.JWT_ACCESS_SECRET,
        { subject: userId, jwtid: "school-a-session", expiresIn: "1m" }
    );
    const response = await request(app)
        .get("/api/v1/schools/me?schoolId=64a000000000000000000099")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

    assert.equal(response.body.data.school.id, schoolId);
    assert.deepEqual(schoolLookups, [schoolId, schoolId]);
});

test("revoked persisted access sessions are rejected", async (t) => {
    const userId = "64a000000000000000000002";
    t.mock.method(RefreshSession, "findOne", async () => null);
    t.mock.method(User, "findById", async () => null);

    const accessToken = jwt.sign(
        { tokenType: "access" },
        process.env.JWT_ACCESS_SECRET,
        { subject: userId, jwtid: "revoked-session", expiresIn: "1m" }
    );
    await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(401);
});

test("teachers cannot update school profiles through the protected route", async (t) => {
    const schoolId = "64a000000000000000000001";
    const userId = "64a000000000000000000004";
    const school = {
        _id: schoolId,
        status: "trial",
        subscription: { status: "trial", trialEndsAt: new Date(Date.now() + 60_000) }
    };
    const teacher = {
        _id: userId,
        schoolId,
        role: "teacher",
        status: "active"
    };

    t.mock.method(RefreshSession, "findOne", async () => ({ userId, schoolId }));
    t.mock.method(User, "findById", async () => teacher);
    t.mock.method(School, "findById", async () => school);

    const accessToken = jwt.sign(
        { tokenType: "access" },
        process.env.JWT_ACCESS_SECRET,
        { subject: userId, jwtid: "teacher-session", expiresIn: "1m" }
    );
    const response = await request(app)
        .patch("/api/v1/schools/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "Unauthorized update" })
        .expect(403);

    assert.equal(response.body.message, "You do not have permission to perform this action");
});

test("school profile updates are tenant-bound, partial, transactional, and audited", async (t) => {
    const schoolId = "64a000000000000000000001";
    const actorUserId = "64a000000000000000000002";
    const school = {
        _id: schoolId,
        name: "School A",
        slug: "school-a",
        email: "admin@school-a.example",
        status: "trial",
        subscription: { status: "trial" },
        branches: [],
        settings: { attendanceLateGraceMinutes: 5 }
    };
    const transaction = {
        withTransaction: async (callback) => callback(),
        endSession: async () => { }
    };
    let updateFilter;
    let updateDocument;
    let auditEvent;

    t.mock.method(mongoose, "startSession", async () => transaction);
    t.mock.method(School, "findOneAndUpdate", async (filter, update) => {
        updateFilter = filter;
        updateDocument = update;
        return school;
    });
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() {
        auditEvent = this;
        return this;
    });

    await updateSchoolProfile({
        school: { _id: schoolId },
        user: { _id: actorUserId }
    }, {
        address: { city: "Example City" },
        settings: { attendanceLateGraceMinutes: 5 }
    });

    assert.deepEqual(updateFilter, { _id: schoolId });
    assert.equal(updateDocument.$set["address.city"], "Example City");
    assert.equal(updateDocument.$set["settings.attendanceLateGraceMinutes"], 5);
    assert.equal(updateDocument.$set.address, undefined);
    assert.equal(auditEvent.action, "school.profile.updated");
    assert.equal(auditEvent.schoolId.toString(), schoolId);
    assert.deepEqual(auditEvent.metadata.fields, ["address", "settings"]);
});

test("school login verifies credentials and binds sessions to the school tenant", async (t) => {
    const schoolId = "64a000000000000000000001";
    const school = {
        _id: schoolId,
        status: "trial",
        subscription: { status: "trial", trialEndsAt: new Date(Date.now() + 60_000) }
    };
    const user = {
        _id: "64a000000000000000000002",
        schoolId,
        role: "school_admin",
        status: "active",
        name: "School Admin",
        email: "admin@school-a.example",
        verifyPassword: async (password) => password === "correct-password"
    };
    let sessionRecord;

    t.mock.method(School, "findOne", async (filter) => {
        assert.deepEqual(filter, { slug: "school-a" });
        return school;
    });
    t.mock.method(User, "findOne", (filter) => {
        assert.deepEqual(filter, { schoolId, email: user.email });
        return { select: async () => user };
    });
    t.mock.method(RefreshSession.prototype, "save", async function saveSession() {
        sessionRecord = this;
        return this;
    });

    const result = await login({
        schoolSlug: "school-a",
        email: user.email,
        password: "correct-password"
    });

    assert.equal(result.user.schoolId, schoolId);
    assert.equal(sessionRecord.schoolId.toString(), schoolId);
    await assert.rejects(
        login({ schoolSlug: "school-a", email: user.email, password: "wrong-password" }),
        { statusCode: 401 }
    );
});

test("logout revokes only the refresh session paired with the current access token", async (t) => {
    const userId = "64a000000000000000000002";
    const accessTokenId = "access-session-a";
    const refreshTokenId = "refresh-session-a";
    const refreshToken = jwt.sign(
        { tokenType: "refresh" },
        process.env.JWT_REFRESH_SECRET,
        { subject: userId, jwtid: refreshTokenId, expiresIn: "1m" }
    );
    let revokeFilter;

    t.mock.method(RefreshSession, "updateOne", async (filter) => {
        revokeFilter = filter;
        return { modifiedCount: filter.accessTokenId === accessTokenId ? 1 : 0 };
    });

    await logout({ _id: userId }, accessTokenId, refreshToken);
    assert.equal(revokeFilter.accessTokenId, accessTokenId);
    assert.equal(revokeFilter.tokenId, refreshTokenId);
    assert.equal(
        revokeFilter.tokenHash,
        createHash("sha256").update(refreshToken).digest("hex")
    );
    await assert.rejects(
        logout({ _id: userId }, "different-access-session", refreshToken),
        { statusCode: 401 }
    );
});

test("refresh rotates valid sessions and rejects replayed refresh tokens", async (t) => {
    const userId = "64a000000000000000000002";
    const schoolId = "64a000000000000000000001";
    const refreshTokenId = "refresh-session-a";
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
        email: "admin@school-a.example"
    };
    const refreshToken = jwt.sign(
        { tokenType: "refresh" },
        process.env.JWT_REFRESH_SECRET,
        { subject: userId, jwtid: refreshTokenId, expiresIn: "1m" }
    );
    const oldSession = {
        tokenId: refreshTokenId,
        userId,
        revokedAt: null,
        save: async () => { }
    };
    const transaction = {
        withTransaction: async (callback) => callback(),
        endSession: async () => { }
    };
    let activeRefreshSession = oldSession;
    let rotatedSession;

    t.mock.method(mongoose, "startSession", async () => transaction);
    t.mock.method(RefreshSession, "findOne", (filter) => ({
        session: async () => filter.tokenId === activeRefreshSession.tokenId
            ? activeRefreshSession
            : null
    }));
    t.mock.method(RefreshSession.prototype, "save", async function saveSession() {
        rotatedSession = this;
        activeRefreshSession = this;
        return this;
    });
    t.mock.method(User, "findById", () => ({
        session: async () => user
    }));
    t.mock.method(School, "findById", () => ({
        session: async () => school
    }));

    const result = await refreshTokens(refreshToken);
    assert.equal(oldSession.revokedAt instanceof Date, true);
    assert.equal(rotatedSession.userId.toString(), userId);
    assert.equal(rotatedSession.schoolId.toString(), schoolId);
    assert.notEqual(rotatedSession.tokenId, refreshTokenId);
    assert.equal(result.user.schoolId, schoolId);

    await assert.rejects(refreshTokens(refreshToken), { statusCode: 401 });
});

test("provisioned platform admins can sign in without a school tenant", async (t) => {
    const userId = "64a000000000000000000003";
    const platformAdmin = {
        _id: userId,
        name: "Platform Admin",
        email: "platform@example.com",
        role: "platform_super_admin",
        status: "active",
        verifyPassword: async (password) => password === "correct-password"
    };
    let persistedSession;
    let auditEvent;
    const transaction = {
        withTransaction: async (callback) => callback(),
        endSession: async () => { }
    };

    t.mock.method(mongoose, "startSession", async () => transaction);
    t.mock.method(User, "findOne", (filter) => {
        assert.deepEqual(filter, {
            schoolId: { $exists: false },
            email: "platform@example.com",
            role: "platform_super_admin"
        });
        return {
            select: async (field) => {
                assert.equal(field, "+passwordHash");
                return platformAdmin;
            }
        };
    });
    t.mock.method(RefreshSession.prototype, "save", async function saveSession() {
        persistedSession = this;
        return this;
    });
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() {
        auditEvent = this;
        return this;
    });

    const result = await login({
        email: "platform@example.com",
        password: "correct-password"
    });

    assert.equal(result.user.role, "platform_super_admin");
    assert.equal(result.user.schoolId, null);
    assert.equal(typeof result.accessToken, "string");
    assert.equal(typeof result.refreshToken, "string");
    assert.equal(persistedSession.schoolId, undefined);
    assert.equal(auditEvent.action, "platform.super_admin.signed_in");
    assert.equal(auditEvent.actorUserId.toString(), userId);
    assert.equal(auditEvent.schoolId, null);
});

test("password-save hook hashes passwords and generated school slugs remain login-valid", async () => {
    const user = new User({
        schoolId: "64a000000000000000000001",
        name: "School Admin",
        email: "admin@example.com",
        passwordHash: "a-secure-password-123",
        role: "school_admin"
    });
    const passwordHashHook = User.schema.s.hooks._pres.get("save")
        .find(({ fn }) => fn.name === "hashPassword").fn;
    await passwordHashHook.call(user);

    assert.notEqual(user.passwordHash, "a-secure-password-123");
    assert.equal(await user.verifyPassword("a-secure-password-123"), true);
    assert.equal(await user.verifyPassword("incorrect-password"), false);

    assert.equal(slugFromName("School With A Very Long Name-".repeat(4)).endsWith("-"), false);
    assert.match(slugFromName("School With A Very Long Name-".repeat(4)), /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(durationInSeconds("15m", "ACCESS_TOKEN_TTL"), 900);
    assert.throws(() => durationInSeconds("0s", "ACCESS_TOKEN_TTL"));
    assert.throws(() => durationInSeconds("366d", "ACCESS_TOKEN_TTL"));
    assert.notEqual(getConfig().accessSecret, getConfig().refreshSecret);
});

test("school and user schemas enforce tenant roles, indexes, and safe public fields", async () => {
    const school = new School({
        name: "Example School",
        slug: "example-school",
        email: "admin@example.com"
    });
    await school.validate();
    assert.equal(school.status, "trial");
    assert.equal(school.branches[0].code, "MAIN");

    const user = new User({
        schoolId: school._id,
        name: "School Admin",
        email: "admin@example.com",
        passwordHash: "a-secure-password-123",
        role: "school_admin"
    });
    await user.validate();
    assert.equal(user.toObject().passwordHash, undefined);

    const tenantEmailIndex = User.schema.indexes().find(([keys, options]) =>
        keys.schoolId === 1 && keys.email === 1 && options.unique
    );
    assert.ok(tenantEmailIndex);
    const platformEmailIndex = User.schema.indexes().find(([keys, options]) =>
        keys.email === 1
        && options.unique
        && options.partialFilterExpression?.role === "platform_super_admin"
    );
    assert.ok(platformEmailIndex);
    assert.equal(School.schema.indexes().some(([keys, options]) => keys.slug === 1 && options.unique), true);
});

test("academic session creation derives tenant ID and audits within the transaction", async (t) => {
    const schoolId = "64a000000000000000000001";
    const actorUserId = "64a000000000000000000002";
    const transaction = {
        withTransaction: async (callback) => callback(),
        endSession: async () => { }
    };
    let createdSession;
    let auditEvent;

    t.mock.method(mongoose, "startSession", async () => transaction);
    t.mock.method(AcademicSession.prototype, "save", async function saveAcademicSession() {
        createdSession = this;
        return this;
    });
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() {
        auditEvent = this;
        return this;
    });

    const created = await createAcademicSession({
        user: { _id: actorUserId, schoolId },
        school: { _id: schoolId }
    }, {
        name: "2026-2027",
        startDate: new Date("2026-08-01"),
        endDate: new Date("2027-06-30"),
        status: "active"
    });

    assert.equal(created.schoolId.toString(), schoolId);
    assert.equal(created.status, "upcoming");
    assert.equal(createdSession.schoolId.toString(), schoolId);
    assert.equal(auditEvent.action, "academic_session.created");
    assert.equal(auditEvent.schoolId.toString(), schoolId);
});

test("branch creation is tenant-scoped, audited, and rejects duplicate branch codes", async (t) => {
    const schoolId = "64a000000000000000000001";
    const actorUserId = "64a000000000000000000002";
    const school = new School({
        _id: schoolId,
        name: "School A",
        slug: "school-a",
        email: "admin@school-a.example"
    });
    const transaction = {
        withTransaction: async (callback) => callback(),
        endSession: async () => { }
    };
    let auditEvent;

    t.mock.method(mongoose, "startSession", async () => transaction);
    t.mock.method(School, "findById", () => ({ session: async () => school }));
    t.mock.method(School.prototype, "save", async function saveSchool() { return this; });
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() {
        auditEvent = this;
        return this;
    });

    const req = {
        user: { _id: actorUserId, schoolId },
        school: { _id: schoolId }
    };
    const branch = await createBranch(req, { name: "North", code: "north" });

    assert.equal(branch.code, "NORTH");
    assert.equal(branch.isMain, false);
    assert.equal(school.branches.length, 2);
    assert.equal(auditEvent.action, "branch.created");
    await assert.rejects(createBranch(req, { name: "North Annex", code: "NORTH" }), {
        statusCode: 409
    });
});

test("academic session activation completes the previous session atomically", async (t) => {
    const schoolId = "64a000000000000000000001";
    const actorUserId = "64a000000000000000000002";
    const targetId = "64a000000000000000000003";
    const currentId = "64a000000000000000000004";
    const target = new AcademicSession({
        _id: targetId,
        schoolId,
        name: "2027-2028",
        startDate: new Date("2027-08-01"),
        endDate: new Date("2028-06-30"),
        status: "upcoming"
    });
    const current = new AcademicSession({
        _id: currentId,
        schoolId,
        name: "2026-2027",
        startDate: new Date("2026-08-01"),
        endDate: new Date("2027-06-30"),
        status: "active"
    });
    const transaction = {
        withTransaction: async (callback) => callback(),
        endSession: async () => { }
    };
    let auditEvent;

    t.mock.method(mongoose, "startSession", async () => transaction);
    t.mock.method(AcademicSession, "findOne", (filter) => ({
        session: async () => filter._id ? target : current
    }));
    t.mock.method(AcademicSession.prototype, "save", async function saveSession() { return this; });
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() {
        auditEvent = this;
        return this;
    });

    const activated = await activateAcademicSession({
        user: { _id: actorUserId, schoolId },
        school: { _id: schoolId }
    }, targetId);

    assert.equal(activated.status, "active");
    assert.equal(current.status, "completed");
    assert.equal(auditEvent.action, "academic_session.activated");
});

test("academic child lookups and updates always include the authenticated tenant", async (t) => {
    const schoolA = "64a000000000000000000001";
    const schoolB = "64a000000000000000000009";
    const actor = "64a000000000000000000002";
    const academicSessionId = "64a000000000000000000003";
    const classId = "64a000000000000000000004";
    const transaction = {
        withTransaction: async (callback) => callback(),
        endSession: async () => { }
    };
    let sessionFilter;
    let classFilter;

    t.mock.method(mongoose, "startSession", async () => transaction);
    t.mock.method(AcademicSession, "findOne", (filter) => {
        sessionFilter = filter;
        return { session: async () => null };
    });
    t.mock.method(AcademicClass, "findOne", (filter) => {
        classFilter = filter;
        return { session: async () => null };
    });

    const req = {
        user: { _id: actor, schoolId: schoolA },
        school: { _id: schoolA }
    };

    await assert.rejects(createSection(req, {
        academicSessionId,
        classId,
        branchId: "64a000000000000000000005",
        name: "A"
    }), { statusCode: 404 });
    assert.deepEqual(sessionFilter, { _id: academicSessionId, schoolId: schoolA });

    await assert.rejects(updateClass(req, classId, { name: "Changed" }), { statusCode: 404 });
    assert.deepEqual(classFilter, { _id: classId, schoolId: schoolA });
    assert.notEqual(schoolA, schoolB);
});

test("timetable entries require a same-school section, assigned class subject, and teacher", async (t) => {
    const schoolId = "64a000000000000000000001";
    const classId = "64a000000000000000000004";
    const sessionId = "64a000000000000000000003";
    const sectionId = "64a000000000000000000005";
    const classSubjectId = "64a000000000000000000006";
    const teacherId = "64a000000000000000000007";
    const actorUserId = "64a000000000000000000002";
    const section = { _id: sectionId, schoolId, classId, isActive: true };
    const classSubject = {
        _id: classSubjectId,
        schoolId,
        classId,
        teacherId,
        isActive: true
    };
    const academicSession = { _id: sessionId, status: "active" };
    const transaction = {
        withTransaction: async (callback) => callback(),
        endSession: async () => { }
    };
    let timetableRecord;
    let auditEvent;
    const refFilters = [];

    t.mock.method(mongoose, "startSession", async () => transaction);
    t.mock.method(Section, "findOne", (filter) => {
        refFilters.push(filter);
        return { session: async () => section };
    });
    t.mock.method(ClassSubject, "findOne", (filter) => {
        refFilters.push(filter);
        return { session: async () => classSubject };
    });
    t.mock.method(AcademicSession, "findOne", (filter) => ({
        session: async () => filter.schoolId === schoolId ? academicSession : null
    }));
    t.mock.method(TimetableEntry.prototype, "save", async function saveTimetable() {
        timetableRecord = this;
        return this;
    });
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() {
        auditEvent = this;
        return this;
    });

    const req = {
        user: { _id: actorUserId, schoolId },
        school: { _id: schoolId }
    };
    const input = {
        academicSessionId: sessionId,
        sectionId,
        classSubjectId,
        dayOfWeek: 1,
        periodNumber: 1,
        startsAt: "08:00",
        endsAt: "08:45"
    };
    const result = await createTimetableEntry(req, input);

    assert.equal(result.teacherId.toString(), teacherId);
    assert.equal(timetableRecord.schoolId.toString(), schoolId);
    assert.deepEqual(refFilters[0], {
        _id: sectionId, schoolId, academicSessionId: sessionId, isActive: true
    });
    assert.deepEqual(refFilters[1], {
        _id: classSubjectId, schoolId, academicSessionId: sessionId, isActive: true
    });
    assert.equal(auditEvent.action, "timetable_entry.created");
});

test("academic endpoints reject unauthenticated access and tenant query injection", async (t) => {
    await request(app).get("/api/v1/academics/classes").expect(401);
    await request(app).get("/api/v1/students/guardians").expect(401);

    const schoolId = "64a000000000000000000001";
    const userId = "64a000000000000000000004";
    const school = {
        _id: schoolId,
        status: "trial",
        subscription: { status: "trial", trialEndsAt: new Date(Date.now() + 60_000) }
    };
    const teacher = { _id: userId, schoolId, role: "teacher", status: "active" };
    t.mock.method(RefreshSession, "findOne", async () => ({ userId, schoolId }));
    t.mock.method(User, "findById", async () => teacher);
    t.mock.method(School, "findById", async () => school);

    const accessToken = jwt.sign(
        { tokenType: "access" },
        process.env.JWT_ACCESS_SECRET,
        { subject: userId, jwtid: "academic-read-session", expiresIn: "1m" }
    );
    await request(app)
        .get("/api/v1/academics/classes?schoolId=64a000000000000000000009")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(400);

    await request(app)
        .post("/api/v1/academics/classes")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "Class 1", code: "C1" })
        .expect(403);
});

test("validated Express query parameters are normalized before academic list handlers", async (t) => {
    const schoolId = "64a000000000000000000001";
    const userId = "64a000000000000000000004";
    const school = {
        _id: schoolId,
        status: "trial",
        subscription: { status: "trial", trialEndsAt: new Date(Date.now() + 60_000) }
    };
    const teacher = { _id: userId, schoolId, role: "teacher", status: "active" };
    let queryFilter;
    let paginationSkip;
    const queryBuilder = {
        sort() { return this; },
        skip(value) { paginationSkip = value; return this; },
        limit() { return this; },
        lean: async () => []
    };

    t.mock.method(RefreshSession, "findOne", async () => ({ userId, schoolId }));
    t.mock.method(User, "findById", async () => teacher);
    t.mock.method(School, "findById", async () => school);
    t.mock.method(AcademicClass, "find", (filter) => {
        queryFilter = filter;
        return queryBuilder;
    });
    t.mock.method(AcademicClass, "countDocuments", async (filter) => {
        assert.deepEqual(filter, queryFilter);
        return 0;
    });

    const accessToken = jwt.sign(
        { tokenType: "access" },
        process.env.JWT_ACCESS_SECRET,
        { subject: userId, jwtid: "academic-query-session", expiresIn: "1m" }
    );
    const response = await request(app)
        .get("/api/v1/academics/classes?page=2&limit=5&isActive=false")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

    assert.equal(queryFilter.schoolId, schoolId);
    assert.equal(queryFilter.isActive, false);
    assert.equal(response.body.data.pagination.page, 2);
    assert.equal(response.body.data.pagination.limit, 5);
    assert.equal(paginationSkip, 5);
});

test("academic models require tenant IDs and declare tenant-scoped uniqueness", () => {
    for (const Model of [
        AcademicSession, AcademicClass, Section, Subject, ClassSubject,
        TimetableEntry, Student, Guardian, StudentGuardian, StudentAcademicHistory,
        StudentLeavingCertificate, StudentAttendance, StaffAttendance
    ]) {
        assert.equal(Model.schema.path("schoolId").isRequired, true);
    }

    assert.ok(AcademicSession.schema.indexes().some(([keys, options]) =>
        keys.schoolId === 1 && keys.name === 1 && options.unique
    ));
    assert.ok(AcademicSession.schema.indexes().some(([keys, options]) =>
        keys.schoolId === 1
        && keys.status === 1
        && options.unique
        && options.partialFilterExpression?.status === "active"
    ));
    assert.ok(Section.schema.indexes().some(([keys, options]) =>
        keys.schoolId === 1
        && keys.academicSessionId === 1
        && keys.classId === 1
        && keys.name === 1
        && options.unique
    ));
    assert.ok(StudentAttendance.schema.indexes().some(([keys, options]) =>
        keys.schoolId === 1 && keys.studentId === 1 && keys.date === 1 && options.unique
    ));
    assert.ok(StaffAttendance.schema.indexes().some(([keys, options]) =>
        keys.schoolId === 1 && keys.userId === 1 && keys.date === 1 && options.unique
    ));
    assert.ok(TimetableEntry.schema.indexes().some(([keys, options]) =>
        keys.schoolId === 1
        && keys.academicSessionId === 1
        && keys.sectionId === 1
        && keys.dayOfWeek === 1
        && keys.periodNumber === 1
        && options.unique
    ));
    assert.ok(Student.schema.indexes().some(([keys, options]) =>
        keys.schoolId === 1 && keys.admissionNumber === 1 && options.unique
    ));
    assert.ok(StudentGuardian.schema.indexes().some(([keys, options]) =>
        keys.schoolId === 1
        && keys.studentId === 1
        && keys.isPrimary === 1
        && options.unique
        && options.partialFilterExpression?.isPrimary === true
    ));

    const invalidSession = new AcademicSession({
        schoolId: "64a000000000000000000001",
        name: "Invalid",
        startDate: new Date("2027-08-01"),
        endDate: new Date("2027-07-01")
    });
    return assert.rejects(invalidSession.validate());
});

test("staff account creation is tenant-derived and excludes platform roles", async (t) => {
    const schoolId = "64a000000000000000000001";
    const actorUserId = "64a000000000000000000002";
    const transaction = {
        withTransaction: async (callback) => callback(),
        endSession: async () => { }
    };
    let createdUser;
    let auditEvent;

    t.mock.method(mongoose, "startSession", async () => transaction);
    t.mock.method(User.prototype, "save", async function saveUser() {
        createdUser = this;
        return this;
    });
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() {
        auditEvent = this;
        return this;
    });

    const user = await createUser({
        user: { _id: actorUserId, schoolId },
        school: { _id: schoolId }
    }, {
        name: "School Teacher",
        email: "teacher@example.com",
        role: "teacher",
        password: "a-secure-password-123"
    });

    assert.equal(user.schoolId.toString(), schoolId);
    assert.equal(createdUser.passwordHash, "a-secure-password-123");
    assert.equal(user.toJSON().passwordHash, undefined);
    assert.equal(auditEvent.action, "user.created");
});

test("student admission binds tenant, validates placement, reserves capacity, and records history", async (t) => {
    const schoolId = "64a000000000000000000001";
    const actorUserId = "64a000000000000000000002";
    const sessionId = "64a000000000000000000003";
    const classId = "64a000000000000000000004";
    const sectionId = "64a000000000000000000005";
    const branchId = "64a000000000000000000006";
    const section = { _id: sectionId, schoolId, enrolledCount: 0, capacity: 30 };
    const academicSession = { _id: sessionId, status: "active" };
    const academicClass = { _id: classId, schoolId, isActive: true };
    const school = { _id: schoolId, branches: [{ _id: branchId }] };
    const transaction = {
        withTransaction: async (callback) => callback(),
        endSession: async () => { }
    };
    let studentRecord;
    let studentHistory;
    let auditEvent;
    let sectionCapacityFilter;

    t.mock.method(mongoose, "startSession", async () => transaction);
    t.mock.method(AcademicSession, "findOne", () => ({ session: async () => academicSession }));
    t.mock.method(AcademicClass, "findOne", () => ({ session: async () => academicClass }));
    t.mock.method(Section, "findOne", () => ({ session: async () => section }));
    t.mock.method(School, "findById", () => ({ session: async () => school }));
    t.mock.method(Section, "updateOne", async (filter) => {
        sectionCapacityFilter = filter;
        return { modifiedCount: 1 };
    });
    t.mock.method(Student.prototype, "save", async function saveStudent() {
        studentRecord = this;
        return this;
    });
    t.mock.method(StudentAcademicHistory.prototype, "save", async function saveHistory() {
        studentHistory = this;
        return this;
    });
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() {
        auditEvent = this;
        return this;
    });

    const result = await admitStudent({
        user: { _id: actorUserId, schoolId },
        school: { _id: schoolId }
    }, {
        admissionNumber: "s-001",
        firstName: "Student",
        lastName: "One",
        dateOfBirth: new Date("2015-05-01"),
        admissionDate: new Date("2026-08-01"),
        branchId,
        academicSessionId: sessionId,
        classId,
        sectionId,
        guardianIds: []
    });

    await studentRecord.validate();
    assert.equal(result.admissionNumber, "S-001");
    assert.equal(studentRecord.schoolId.toString(), schoolId);
    assert.equal(studentRecord.guardianIds, undefined);
    assert.equal(sectionCapacityFilter.schoolId, schoolId);
    assert.deepEqual(sectionCapacityFilter.$expr, { $lt: ["$enrolledCount", "$capacity"] });
    assert.equal(studentHistory.eventType, "admitted");
    assert.equal(studentHistory.schoolId.toString(), schoolId);
    assert.equal(auditEvent.action, "student.admitted");
});

test("student admission rejects full sections before creating an enrollment", async (t) => {
    const schoolId = "64a000000000000000000001";
    const actorUserId = "64a000000000000000000002";
    const sessionId = "64a000000000000000000003";
    const classId = "64a000000000000000000004";
    const sectionId = "64a000000000000000000005";
    const branchId = "64a000000000000000000006";
    const transaction = {
        withTransaction: async (callback) => callback(),
        endSession: async () => { }
    };
    let studentCreated = false;

    t.mock.method(mongoose, "startSession", async () => transaction);
    t.mock.method(AcademicSession, "findOne", () => ({
        session: async () => ({ _id: sessionId, status: "active" })
    }));
    t.mock.method(AcademicClass, "findOne", () => ({
        session: async () => ({ _id: classId, isActive: true })
    }));
    t.mock.method(Section, "findOne", () => ({
        session: async () => ({ _id: sectionId, isActive: true })
    }));
    t.mock.method(School, "findById", () => ({
        session: async () => ({ _id: schoolId, branches: [{ _id: branchId }] })
    }));
    t.mock.method(Section, "updateOne", async () => ({ modifiedCount: 0 }));
    t.mock.method(Student.prototype, "save", async function saveStudent() {
        studentCreated = true;
        return this;
    });

    await assert.rejects(admitStudent({
        user: { _id: actorUserId, schoolId },
        school: { _id: schoolId }
    }, {
        admissionNumber: "S-002",
        firstName: "Student",
        lastName: "Two",
        dateOfBirth: new Date("2015-05-01"),
        branchId,
        academicSessionId: sessionId,
        classId,
        sectionId
    }), { statusCode: 409 });
    assert.equal(studentCreated, false);
});

test("student detail queries do not disclose records from another tenant", async (t) => {
    const schoolA = "64a000000000000000000001";
    const studentId = "64a000000000000000000009";
    let lookup;
    t.mock.method(Student, "findOne", async (filter) => {
        lookup = filter;
        return null;
    });

    await assert.rejects(getStudent({
        user: { schoolId: schoolA },
        school: { _id: schoolA }
    }, studentId), { statusCode: 404 });
    assert.deepEqual(lookup, { _id: studentId, schoolId: schoolA });
});

test("student promotion moves placements and writes academic history in one transaction", async (t) => {
    const schoolId = "64a000000000000000000001";
    const studentId = "64a000000000000000000002";
    const actorUserId = "64a000000000000000000003";
    const oldSessionId = "64a000000000000000000004";
    const newSessionId = "64a000000000000000000005";
    const oldClassId = "64a000000000000000000006";
    const newClassId = "64a000000000000000000007";
    const oldSectionId = "64a000000000000000000008";
    const newSectionId = "64a000000000000000000009";
    const oldBranchId = "64a00000000000000000000a";
    const newBranchId = "64a00000000000000000000b";
    const student = new Student({
        _id: studentId,
        schoolId,
        admissionNumber: "S-1",
        firstName: "Student",
        lastName: "One",
        dateOfBirth: new Date("2015-05-01"),
        status: "enrolled",
        branchId: oldBranchId,
        academicSessionId: oldSessionId,
        classId: oldClassId,
        sectionId: oldSectionId
    });

    const sessionRecords = {
        [oldSessionId]: { _id: oldSessionId, startDate: new Date("2026-08-01") },
        [newSessionId]: { _id: newSessionId, startDate: new Date("2027-08-01"), status: "upcoming" }
    };
    const section = { _id: newSectionId, classId: newClassId };
    const academicClass = { _id: newClassId, isActive: true };
    const school = { _id: schoolId, branches: [{ _id: newBranchId }] };
    const transaction = {
        withTransaction: async (callback) => callback(),
        endSession: async () => { }
    };
    const capacityUpdates = [];
    let history;
    let auditEvent;

    t.mock.method(mongoose, "startSession", async () => transaction);
    t.mock.method(Student, "findOne", () => ({ session: async () => student }));
    t.mock.method(AcademicSession, "findOne", (filter) => ({
        session: async () => sessionRecords[filter._id]
    }));
    t.mock.method(AcademicClass, "findOne", () => ({ session: async () => academicClass }));
    t.mock.method(Section, "findOne", () => ({ session: async () => section }));
    t.mock.method(School, "findById", () => ({ session: async () => school }));
    t.mock.method(Section, "updateOne", async (filter, update) => {
        capacityUpdates.push({ filter, update });
        return { modifiedCount: 1 };
    });
    t.mock.method(Student.prototype, "save", async function saveStudent() { return this; });
    t.mock.method(StudentAcademicHistory.prototype, "save", async function saveHistory() {
        history = this;
        return this;
    });
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() {
        auditEvent = this;
        return this;
    });

    const result = await transitionStudentPlacement({
        user: { _id: actorUserId, schoolId },
        school: { _id: schoolId }
    }, studentId, {
        academicSessionId: newSessionId,
        classId: newClassId,
        sectionId: newSectionId,
        branchId: newBranchId
    });

    assert.equal(result.academicSessionId, newSessionId);
    assert.equal(student.status, "enrolled");
    assert.deepEqual(
        capacityUpdates.map(({ filter }) => String(filter._id)),
        [oldSectionId, newSectionId]
    );
    assert.equal(history.eventType, "promoted");
    assert.equal(history.from.sectionId.toString(), oldSectionId);
    assert.equal(history.to.sectionId.toString(), newSectionId);
    assert.equal(auditEvent.action, "student.promoted");
});

test("leaving certificates snapshot terminal student records and are tenant-scoped", async (t) => {
    const schoolId = "64a000000000000000000001";
    const studentId = "64a000000000000000000003";
    const actorUserId = "64a000000000000000000002";
    const school = { _id: schoolId, name: "School A" };
    const student = {
        _id: studentId,
        schoolId,
        admissionNumber: "STU-001",
        firstName: "Ari",
        lastName: "Student",
        dateOfBirth: new Date("2010-02-03"),
        status: "withdrawn"
    };
    const leavingEvent = {
        eventType: "withdrawn",
        effectiveAt: new Date("2025-01-15"),
        from: {
            academicSessionId: "64a000000000000000000010",
            classId: "64a000000000000000000011",
            sectionId: "64a000000000000000000012",
            branchId: "64a000000000000000000013"
        }
    };
    let certificate;
    let auditEvent;
    const transaction = {
        withTransaction: async (callback) => callback(),
        endSession: async () => { }
    };
    t.mock.method(mongoose, "startSession", async () => transaction);
    t.mock.method(Student, "findOne", () => ({ session: async () => student }));
    t.mock.method(StudentLeavingCertificate, "findOne", () => ({ session: async () => null }));
    t.mock.method(StudentAcademicHistory, "findOne", () => ({
        sort() { return this; },
        session: async () => leavingEvent
    }));
    t.mock.method(School, "findById", () => ({ session: async () => school }));
    t.mock.method(StudentLeavingCertificate.prototype, "save", async function saveCertificate() {
        certificate = this;
        return this;
    });
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() {
        auditEvent = this;
        return this;
    });

    const req = {
        school,
        user: { _id: actorUserId, schoolId }
    };
    const issued = await issueLeavingCertificate(req, studentId, { remarks: "Records transferred" });
    assert.equal(issued.certificateNumber, `LC-${new Date().getUTCFullYear()}-STU-001`);
    assert.equal(issued.schoolName, school.name);
    for (const key of ["academicSessionId", "classId", "sectionId", "branchId"]) {
        assert.equal(issued.lastPlacement[key].toString(), leavingEvent.from[key]);
    }
    assert.equal(issued.leavingDate.toISOString(), leavingEvent.effectiveAt.toISOString());
    assert.equal(issued.remarks, "Records transferred");
    assert.equal(certificate.schoolId.toString(), schoolId);
    assert.equal(auditEvent.action, "student.leaving_certificate.issued");
    assert.equal(auditEvent.metadata.certificateNumber, issued.certificateNumber);

    let findFilter;
    t.mock.method(StudentLeavingCertificate, "findOne", (filter) => {
        findFilter = filter;
        return { lean: async () => issued };
    });
    const result = await getLeavingCertificate(req, studentId);
    assert.equal(result, issued);
    assert.deepEqual(findFilter, { schoolId, studentId });
});

test("leaving certificate issuance rejects enrolled, duplicate, and incomplete records", async (t) => {
    const schoolId = "64a000000000000000000001";
    const studentId = "64a000000000000000000003";
    const school = { _id: schoolId, name: "School A" };
    const req = { school, user: { _id: "64a000000000000000000002", schoolId } };
    const transaction = {
        withTransaction: async (callback) => callback(),
        endSession: async () => { }
    };
    t.mock.method(mongoose, "startSession", async () => transaction);

    t.mock.method(Student, "findOne", () => ({
        session: async () => ({ _id: studentId, status: "enrolled" })
    }));
    await assert.rejects(issueLeavingCertificate(req, studentId), {
        statusCode: 409,
        message: "A leaving certificate can only be issued to a student who has left"
    });

    t.mock.method(Student, "findOne", () => ({
        session: async () => ({ _id: studentId, status: "transferred" })
    }));
    t.mock.method(StudentLeavingCertificate, "findOne", () => ({
        session: async () => ({ _id: "existing-certificate" })
    }));
    await assert.rejects(issueLeavingCertificate(req, studentId), {
        statusCode: 409,
        message: "A leaving certificate has already been issued for this student"
    });

    t.mock.method(StudentLeavingCertificate, "findOne", () => ({ session: async () => null }));
    t.mock.method(StudentAcademicHistory, "findOne", () => ({
        sort() { return this; },
        session: async () => null
    }));
    t.mock.method(School, "findById", () => ({ session: async () => school }));
    await assert.rejects(issueLeavingCertificate(req, studentId), {
        statusCode: 409,
        message: "The student's leaving record is incomplete"
    });
});

test("student attendance is tenant-bound, validates roster membership, and applies late grace rules", async (t) => {
    const schoolId = "64a000000000000000000001";
    const actorUserId = "64a000000000000000000002";
    const sectionId = "64a000000000000000000003";
    const studentId = "64a000000000000000000004";
    const school = {
        _id: schoolId,
        settings: { attendanceStartTime: "08:00", attendanceLateGraceMinutes: 10 }
    };
    const section = {
        _id: sectionId,
        classId: "64a000000000000000000005",
        academicSessionId: "64a000000000000000000006"
    };
    const academicSession = {
        _id: section.academicSessionId,
        startDate: new Date("2025-08-01T00:00:00.000Z"),
        endDate: new Date("2026-06-30T00:00:00.000Z")
    };
    const req = { school, user: { _id: actorUserId, schoolId, role: "principal" } };
    const transaction = {
        withTransaction: async (callback) => callback(),
        endSession: async () => { }
    };
    let operations;
    let auditEvent;
    let sectionFilter;
    const chain = (value) => ({
        select() { return this; },
        session() { return this; },
        lean: async () => value
    });

    t.mock.method(mongoose, "startSession", async () => transaction);
    t.mock.method(Section, "findOne", (filter) => {
        sectionFilter = filter;
        return { session: async () => section };
    });
    t.mock.method(AcademicSession, "findOne", () => ({ session: async () => academicSession }));
    t.mock.method(School, "findById", () => ({ session: async () => school }));
    t.mock.method(Student, "find", () => chain([{ _id: studentId }]));
    t.mock.method(StudentAttendance, "bulkWrite", async (inputOperations) => {
        operations = inputOperations;
        return { modifiedCount: 0, upsertedCount: inputOperations.length };
    });
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() {
        auditEvent = this;
        return this;
    });

    const input = {
        sectionId,
        date: "2026-02-05",
        records: [{ studentId, status: "present", checkIn: "08:15" }]
    };
    assert.equal(studentAttendanceMarkSchema.safeParse(input).success, true);
    assert.equal(studentAttendanceMarkSchema.safeParse({
        ...input,
        schoolId: "64a000000000000000000099"
    }).success, false);
    assert.equal(studentAttendanceMarkSchema.safeParse({
        ...input,
        records: [...input.records, ...input.records]
    }).success, false);
    const result = await markStudentAttendance(req, input);
    assert.equal(result.marked, 1);
    assert.equal(operations[0].updateOne.update.$set.status, "late");
    assert.equal(operations[0].updateOne.filter.schoolId, schoolId);
    assert.equal(operations[0].updateOne.filter.date.toISOString(), "2026-02-05T00:00:00.000Z");
    assert.equal(sectionFilter.schoolId, schoolId);
    assert.equal(auditEvent.action, "attendance.students.marked");

    t.mock.method(Student, "find", () => chain([]));
    await assert.rejects(markStudentAttendance(req, input), {
        statusCode: 404,
        message: "One or more students are not enrolled in this section"
    });

});

test("attendance endpoints require authentication", async () => {
    await request(app)
        .post("/api/v1/attendance/students")
        .send({})
        .expect(401);
    await request(app)
        .get("/api/v1/attendance/students?sectionId=64a000000000000000000001&date=2026-02-05")
        .expect(401);
});

test("staff attendance requires administrator authority and keeps monthly reads tenant-scoped", async (t) => {
    const schoolId = "64a000000000000000000001";
    const actorUserId = "64a000000000000000000002";
    const staffId = "64a000000000000000000003";
    const school = {
        _id: schoolId,
        settings: { attendanceStartTime: "08:00", attendanceLateGraceMinutes: 10 }
    };
    const input = {
        date: "2026-02-05",
        records: [{ userId: staffId, status: "late", checkIn: "08:15" }]
    };
    assert.equal(staffAttendanceMarkSchema.safeParse(input).success, true);

    await assert.rejects(markStaffAttendance({
        school,
        user: { _id: actorUserId, schoolId, role: "teacher" }
    }, input), { statusCode: 403 });

    const transaction = {
        withTransaction: async (callback) => callback(),
        endSession: async () => { }
    };
    const chain = (value) => ({
        select() { return this; },
        session() { return this; },
        lean: async () => value
    });
    let staffFilter;
    let operations;
    t.mock.method(mongoose, "startSession", async () => transaction);
    t.mock.method(School, "findById", () => ({ session: async () => school }));
    t.mock.method(User, "find", (filter) => {
        staffFilter = filter;
        return chain([{ _id: staffId }]);
    });
    t.mock.method(StaffAttendance, "bulkWrite", async (value) => {
        operations = value;
        return { modifiedCount: 0, upsertedCount: value.length };
    });
    t.mock.method(AuditLog.prototype, "save", async () => ({}));

    const result = await markStaffAttendance({
        school,
        user: { _id: actorUserId, schoolId, role: "school_admin" }
    }, input);
    assert.equal(result.marked, 1);
    assert.equal(staffFilter.schoolId, schoolId);
    assert.equal(staffFilter._id.$in[0], staffId);
    assert.equal(operations[0].updateOne.update.$set.status, "late");
    assert.equal(operations[0].updateOne.filter.schoolId, schoolId);

    let attendanceFilter;
    const items = [{
        _id: "64a000000000000000000010",
        date: new Date("2026-02-05T00:00:00.000Z"),
        status: "late",
        markedBy: actorUserId
    }];
    t.mock.method(StaffAttendance, "find", (filter) => {
        attendanceFilter = filter;
        return {
            sort() { return this; },
            lean: async () => items
        };
    });
    const monthly = await getMyStaffAttendanceMonth({
        school,
        user: { _id: staffId, schoolId, role: "teacher" }
    }, { month: "2026-02" });
    assert.equal(attendanceFilter.schoolId, schoolId);
    assert.equal(attendanceFilter.userId, staffId);
    assert.deepEqual(monthly.summary, { present: 0, absent: 0, late: 1, leave: 0 });

    let reportFilter;
    const reportItems = [{
        _id: "64a000000000000000000011",
        date: new Date("2026-02-05T00:00:00.000Z"),
        status: "present",
        markedBy: actorUserId,
        userId: { _id: staffId, name: "Staff Member", role: "teacher", jobTitle: "Teacher" }
    }];
    t.mock.method(StaffAttendance, "find", (filter) => {
        reportFilter = filter;
        return {
            populate() { return this; },
            sort() { return this; },
            skip() { return this; },
            limit() { return this; },
            lean: async () => reportItems
        };
    });
    t.mock.method(StaffAttendance, "countDocuments", async () => 1);
    t.mock.method(StaffAttendance, "aggregate", async () => [{ _id: "present", count: 1 }]);
    const report = await getStaffAttendanceMonth({
        school,
        user: { _id: actorUserId, schoolId, role: "school_admin" }
    }, { month: "2026-02", page: 1, limit: 10 });
    assert.equal(reportFilter.schoolId, schoolId);
    assert.equal(report.items[0].staff.name, "Staff Member");
    assert.deepEqual(report.summary, { present: 1, absent: 0, late: 0, leave: 0 });
});
