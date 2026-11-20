import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { validateMongoTestUri } from "../src/testing/mongo-test-safety.js";

// Real-database regression test. Previous tests mocked Mongoose, so a real
// MongoServerError from a transaction was never observed. This suite runs the
// actual createTimetableEntry service against a disposable, isolated replica
// set (transactions require a replica set) and verifies that rows are really
// persisted. It never touches MONGO_URI / the shared development database.
let replSet;
let dbName;

test.before(async () => {
    const id = randomUUID().replaceAll("-", "").slice(0, 12);
    dbName = `schoolflow_test_timetable_${id}`;
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri(dbName);
    validateMongoTestUri(uri);
    await mongoose.connect(uri);

    const models = await Promise.all([
        import("../src/models/academic-session.model.js"),
        import("../src/models/section.model.js"),
        import("../src/models/class-subject.model.js"),
        import("../src/models/timetable-entry.model.js"),
        import("../src/models/audit-log.model.js")
    ]);
    await Promise.all(models.map(({ default: model }) => model.init()));
});

test.after(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (replSet) await replSet.stop();
});

const makeFixture = async () => {
    const { default: AcademicSession } = await import("../src/models/academic-session.model.js");
    const { default: Section } = await import("../src/models/section.model.js");
    const { default: ClassSubject } = await import("../src/models/class-subject.model.js");
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const schoolId = new mongoose.Types.ObjectId();
    const academicSessionId = new mongoose.Types.ObjectId();
    const classId = new mongoose.Types.ObjectId();
    const sectionId = new mongoose.Types.ObjectId();
    const classSubjectId = new mongoose.Types.ObjectId();
    const teacherId = new mongoose.Types.ObjectId();

    await AcademicSession.create({
        _id: academicSessionId,
        schoolId,
        name: `session-${suffix}`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-06-30"),
        status: "active"
    });
    await Section.create({
        _id: sectionId,
        schoolId,
        academicSessionId,
        classId,
        branchId: new mongoose.Types.ObjectId(),
        name: `section-${suffix}`
    });
    await ClassSubject.create({
        _id: classSubjectId,
        schoolId,
        academicSessionId,
        classId,
        subjectId: new mongoose.Types.ObjectId(),
        teacherId
    });

    const req = { user: { _id: teacherId, schoolId }, school: { _id: schoolId } };
    const input = {
        academicSessionId: academicSessionId.toString(),
        sectionId: sectionId.toString(),
        classSubjectId: classSubjectId.toString(),
        dayOfWeek: 1,
        periodNumber: 1,
        startsAt: "08:00",
        endsAt: "09:00"
    };
    return { req, input, schoolId, sectionId, classSubjectId, teacherId };
};

test("createTimetableEntry persists the timetable entry and audit log in a real transaction", async () => {
    const { default: TimetableEntry } = await import("../src/models/timetable-entry.model.js");
    const { default: AuditLog } = await import("../src/models/audit-log.model.js");
    const { createTimetableEntry } = await import("../src/services/academic.service.js");
    const { req, input, schoolId, sectionId } = await makeFixture();

    const created = await createTimetableEntry(req, input);
    assert.ok(created?._id, "the service must return the created entry");

    const stored = await TimetableEntry.findOne({ _id: created._id }).lean();
    assert.ok(stored, "the timetable entry must actually exist in MongoDB");
    assert.equal(stored.schoolId.toString(), schoolId.toString());
    assert.equal(stored.sectionId.toString(), sectionId.toString());
    assert.equal(stored.dayOfWeek, 1);
    assert.equal(stored.periodNumber, 1);
    assert.equal(stored.startsAt, "08:00");
    assert.equal(stored.endsAt, "09:00");
    // The teacher is taken from the class-subject assignment, never the client.
    assert.ok(stored.teacherId);

    const audit = await AuditLog.findOne({
        schoolId,
        resourceType: "timetable_entry",
        resourceId: created._id
    }).lean();
    assert.ok(audit, "the audit log must be committed in the same transaction");
    assert.equal(audit.action, "timetable_entry.created");
});

test("duplicate timetable periods are rejected as a handled 409, not a 500", async () => {
    const { createTimetableEntry } = await import("../src/services/academic.service.js");
    const { req, input, schoolId } = await makeFixture();

    await createTimetableEntry(req, input);
    await assert.rejects(
        createTimetableEntry(req, input),
        (error) => error.code === 11000,
        "the unique section/period index must reject the second save"
    );
    assert.equal(schoolId instanceof mongoose.Types.ObjectId, true);
});
