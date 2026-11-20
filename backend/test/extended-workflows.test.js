import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import AcademicClass from "../src/models/academic-class.model.js";
import AuditLog from "../src/models/audit-log.model.js";
import FixedAsset from "../src/models/fixed-asset.model.js";
import FeeVoucher from "../src/models/fee-voucher.model.js";
import Guardian from "../src/models/guardian.model.js";
import Student from "../src/models/student.model.js";
import StudentGuardian from "../src/models/student-guardian.model.js";
import Section from "../src/models/section.model.js";
import User from "../src/models/user.model.js";
import { hasPermission } from "../src/middleware/authorization.middleware.js";
import {
    getParentStudentFees,
    listParentStudents
} from "../src/services/parent-portal.service.js";
import {
    linkGuardianAccount,
    unlinkGuardianAccount
} from "../src/services/student.service.js";

const withMockedTransaction = (t) => {
    const transaction = {
        async withTransaction(callback) { return callback(); },
        async endSession() {}
    };
    t.mock.method(mongoose, "startSession", async () => transaction);
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() { return this; });
};

test("parent self-service is school-scoped, returns explicitly linked students, and resolves class/section names (mocked models)", async () => {
    const schoolId = new mongoose.Types.ObjectId();
    const guardianId = new mongoose.Types.ObjectId();
    const studentId = new mongoose.Types.ObjectId();
    const classId = new mongoose.Types.ObjectId();
    const sectionId = new mongoose.Types.ObjectId();
    const originalGuardianFind = Guardian.find;
    const originalLinkFind = StudentGuardian.find;
    const originalStudentFind = Student.find;
    const originalClassFind = AcademicClass.find;
    const originalSectionFind = Section.find;
    let guardianFilter;
    let linkFilter;
    let studentFilter;
    let classFilter;
    let sectionFilter;

    Guardian.find = (filter) => {
        guardianFilter = filter;
        return { select: () => ({ lean: async () => [{ _id: guardianId }] }) };
    };
    StudentGuardian.find = (filter) => {
        linkFilter = filter;
        return { select: () => ({ lean: async () => [{ studentId }] }) };
    };
    Student.find = (filter) => {
        studentFilter = filter;
        const query = {
            sort() { return this; },
            select() { return this; },
            lean: async () => [{
                _id: studentId,
                admissionNumber: "A-1",
                firstName: "Ari",
                lastName: "Taylor",
                status: "enrolled",
                classId,
                sectionId
            }]
        };
        return query;
    };
    AcademicClass.find = (filter) => {
        classFilter = filter;
        return { select: () => ({ lean: async () => [{ _id: classId, name: "Grade 1", code: "G1" }] }) };
    };
    Section.find = (filter) => {
        sectionFilter = filter;
        return { select: () => ({ lean: async () => [{ _id: sectionId, name: "A" }] }) };
    };

    try {
        const parentUserId = new mongoose.Types.ObjectId();
        const req = {
            user: { _id: parentUserId, role: "parent", schoolId, email: "PARENT@example.test" },
            school: { _id: schoolId }
        };
        const students = await listParentStudents(req);
        assert.equal(students.length, 1);
        assert.equal(students[0].id, String(studentId));
        // The parent dashboard consumes these fields directly; IDs alone are not enough.
        assert.equal(students[0].className, "Grade 1");
        assert.equal(students[0].classCode, "G1");
        assert.equal(students[0].sectionName, "A");
        assert.equal(guardianFilter.schoolId, schoolId);
        // Authorization must key off the explicit user link, never a mutable email value.
        assert.equal(guardianFilter.userId, parentUserId);
        assert.equal(guardianFilter.email, undefined);
        assert.equal(linkFilter.schoolId, schoolId);
        assert.equal(studentFilter.schoolId, schoolId);
        assert.deepEqual(studentFilter._id.$in, [String(studentId)]);
        assert.equal(classFilter.schoolId, schoolId);
        assert.equal(sectionFilter.schoolId, schoolId);
    } finally {
        Guardian.find = originalGuardianFind;
        StudentGuardian.find = originalLinkFind;
        Student.find = originalStudentFind;
        AcademicClass.find = originalClassFind;
        Section.find = originalSectionFind;
    }
});

test("a parent cannot read an unlinked student fee account (mocked models)", async () => {
    const schoolId = new mongoose.Types.ObjectId();
    const studentId = new mongoose.Types.ObjectId();
    const originalGuardianFind = Guardian.find;
    const originalLinkFind = StudentGuardian.find;
    let attemptedFeeRead = false;
    const originalVoucherFind = FeeVoucher.find;

    Guardian.find = () => ({ select: () => ({ lean: async () => [] }) });
    StudentGuardian.find = () => ({ select: () => ({ lean: async () => [] }) });
    FeeVoucher.find = () => { attemptedFeeRead = true; };

    try {
        await assert.rejects(
            getParentStudentFees({
                user: { role: "parent", schoolId, email: "parent@example.test" },
                school: { _id: schoolId }
            }, studentId),
            { statusCode: 404 }
        );
        assert.equal(attemptedFeeRead, false);
    } finally {
        Guardian.find = originalGuardianFind;
        StudentGuardian.find = originalLinkFind;
        FeeVoucher.find = originalVoucherFind;
    }
});

test("tenant mismatch blocks parent portal access before database lookups", async () => {
    const schoolId = new mongoose.Types.ObjectId();
    const originalGuardianFind = Guardian.find;
    Guardian.find = () => { throw new Error("Database lookup should not occur"); };
    try {
        await assert.rejects(
            listParentStudents({
                user: { role: "parent", schoolId, email: "parent@example.test" },
                school: { _id: new mongoose.Types.ObjectId() }
            }),
            { statusCode: 403 }
        );
    } finally {
        Guardian.find = originalGuardianFind;
    }
});

test("linking a guardian account binds the tenant, the parent role, and audits the change", async (t) => {
    withMockedTransaction(t);
    const schoolId = new mongoose.Types.ObjectId();
    const guardianId = new mongoose.Types.ObjectId();
    const parentUserId = new mongoose.Types.ObjectId();
    const guardian = { _id: guardianId, schoolId, userId: null, async save() { return this; } };
    let userFilter;

    t.mock.method(Guardian, "findOne", () => ({ session: async () => guardian }));
    t.mock.method(User, "findOne", (filter) => {
        userFilter = filter;
        return { session: async () => ({ _id: parentUserId, role: "parent", status: "active" }) };
    });

    const result = await linkGuardianAccount(
        { user: { _id: new mongoose.Types.ObjectId(), schoolId }, school: { _id: schoolId } },
        guardianId,
        parentUserId
    );

    assert.equal(result.userId, String(parentUserId));
    assert.equal(String(guardian.userId), String(parentUserId));
    assert.equal(userFilter.schoolId, schoolId);
    assert.equal(userFilter.role, "parent");
    assert.equal(userFilter.status, "active");
});

test("linking a guardian account rejects a non-parent or cross-tenant user", async (t) => {
    withMockedTransaction(t);
    const schoolId = new mongoose.Types.ObjectId();
    const guardianId = new mongoose.Types.ObjectId();
    const guardian = { _id: guardianId, schoolId, userId: null, async save() { return this; } };

    t.mock.method(Guardian, "findOne", () => ({ session: async () => guardian }));
    t.mock.method(User, "findOne", () => ({ session: async () => null }));

    await assert.rejects(
        linkGuardianAccount(
            { user: { _id: new mongoose.Types.ObjectId(), schoolId }, school: { _id: schoolId } },
            guardianId,
            new mongoose.Types.ObjectId()
        ),
        { statusCode: 404 }
    );
    assert.equal(guardian.userId, null);
});

test("unlinking a guardian account clears the parent link and requires an existing link", async (t) => {
    withMockedTransaction(t);
    const schoolId = new mongoose.Types.ObjectId();
    const guardianId = new mongoose.Types.ObjectId();
    const guardian = {
        _id: guardianId,
        schoolId,
        userId: new mongoose.Types.ObjectId(),
        async save() { return this; }
    };
    t.mock.method(Guardian, "findOne", () => ({ session: async () => guardian }));

    const result = await unlinkGuardianAccount(
        { user: { _id: new mongoose.Types.ObjectId(), schoolId }, school: { _id: schoolId } },
        guardianId
    );
    assert.equal(result.userId, null);
    assert.equal(guardian.userId, null);

    guardian.userId = null;
    await assert.rejects(
        unlinkGuardianAccount(
            { user: { _id: new mongoose.Types.ObjectId(), schoolId }, school: { _id: schoolId } },
            guardianId
        ),
        { statusCode: 409 }
    );
});

test("fixed-asset values reject salvage values at or above acquisition cost", async () => {
    const asset = new FixedAsset({
        schoolId: new mongoose.Types.ObjectId(),
        assetTag: "ASSET-01",
        name: "Library computer",
        category: "IT",
        acquisitionDate: new Date("2026-01-01T00:00:00.000Z"),
        costMinor: 10000,
        salvageValueMinor: 10000,
        currency: "USD",
        usefulLifeMonths: 36,
        createdBy: new mongoose.Types.ObjectId()
    });
    await assert.rejects(asset.validate(), (error) =>
        error.errors.salvageValueMinor.message === "Salvage value must be less than acquisition cost"
    );
});

test("role permissions keep parent, teacher, and platform access distinct", () => {
    assert.equal(hasPermission("parent", "student:read"), true);
    assert.equal(hasPermission("parent", "finance:read"), false);
    assert.equal(hasPermission("teacher", "exams:read"), true);
    assert.equal(hasPermission("teacher", "finance:manage"), false);
    assert.equal(hasPermission("platform_super_admin", "platform:manage"), true);
    assert.equal(hasPermission("school_admin", "platform:manage"), false);
});
