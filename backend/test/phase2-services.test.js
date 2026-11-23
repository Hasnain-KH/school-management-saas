import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import Guardian from "../src/models/guardian.model.js";
import JobRun from "../src/models/job-run.model.js";
import Notification from "../src/models/notification.model.js";
import School from "../src/models/school.model.js";
import SchoolDocument from "../src/models/document.model.js";
import StudentGuardian from "../src/models/student-guardian.model.js";
import StudentMediaCleanupTask from "../src/models/student-media-cleanup-task.model.js";
import { listDocuments } from "../src/services/document.service.js";
import {
    createNotificationsForUserIds,
    listNotifications
} from "../src/services/notification.service.js";
import {
    JOB_NAMES,
    listJobs,
    runAllJobs,
    runJob
} from "../src/services/job-runner.service.js";

const objectId = () => new mongoose.Types.ObjectId();

const leanQuery = (result) => ({ lean: async () => result });
const pagedQuery = (result) => ({
    sort: () => ({ skip: () => ({ limit: () => leanQuery(result) }) })
});

test("notification fan-out dedupes recipients and uses idempotent upserts", async (t) => {
    const schoolId = objectId();
    const userIds = [objectId(), objectId(), objectId()];
    let operations;
    t.mock.method(Notification, "bulkWrite", async (ops) => {
        operations = ops;
        return { upsertedCount: ops.length };
    });

    const result = await createNotificationsForUserIds({
        schoolId,
        userIds: [userIds[0], userIds[1], userIds[0]],
        type: "announcement",
        title: "Fee day",
        body: "Fees are due",
        dedupeKey: "announcement:1"
    });

    assert.equal(result.created, 2);
    assert.equal(operations.length, 2);
    assert.equal(operations[0].updateOne.filter.dedupeKey, "announcement:1");
    assert.equal(operations[0].updateOne.upsert, true);
});

test("listing notifications is scoped to the tenant and the authenticated user", async (t) => {
    const schoolId = objectId();
    const userId = objectId();
    let filter;
    t.mock.method(Notification, "find", (query) => {
        filter = query;
        return pagedQuery([]);
    });
    t.mock.method(Notification, "countDocuments", async () => 0);

    const result = await listNotifications(
        { user: { _id: userId, schoolId }, school: { _id: schoolId } },
        {}
    );

    assert.equal(String(filter.schoolId), String(schoolId));
    assert.equal(String(filter.userId), String(userId));
    assert.deepEqual(result.items, []);
});

test("notification listing rejects a mismatched tenant context", async () => {
    await assert.rejects(
        listNotifications(
            { user: { _id: objectId(), schoolId: objectId() }, school: { _id: objectId() } },
            {}
        ),
        { statusCode: 403 }
    );
});

test("parents only see documents belonging to their explicitly linked children", async (t) => {
    const schoolId = objectId();
    const parentUserId = objectId();
    const linkedStudentId = objectId();
    const unrelatedStudentId = objectId();

    t.mock.method(Guardian, "find", () => ({ select: () => leanQuery([{ _id: objectId() }]) }));
    t.mock.method(StudentGuardian, "find", () => ({ select: () => leanQuery([{ studentId: linkedStudentId }]) }));
    let filter;
    t.mock.method(SchoolDocument, "find", (query) => {
        filter = query;
        return pagedQuery([]);
    });
    t.mock.method(SchoolDocument, "countDocuments", async () => 0);

    await listDocuments(
        { user: { _id: parentUserId, schoolId, role: "parent" }, school: { _id: schoolId } },
        {}
    );

    assert.equal(String(filter.schoolId), String(schoolId));
    assert.deepEqual(filter.studentId.$in, [String(linkedStudentId)]);
    assert.equal(filter.studentId.$in.includes(String(unrelatedStudentId)), false);
});

test("staff document listing is scoped only by tenant, not by parent linkage", async (t) => {
    const schoolId = objectId();
    let filter;
    t.mock.method(SchoolDocument, "find", (query) => {
        filter = query;
        return pagedQuery([]);
    });
    t.mock.method(SchoolDocument, "countDocuments", async () => 0);

    await listDocuments(
        { user: { _id: objectId(), schoolId, role: "school_admin" }, school: { _id: schoolId } },
        {}
    );

    assert.equal(String(filter.schoolId), String(schoolId));
    assert.equal(filter.studentId, undefined);
});

test("a completed scheduled job is never executed twice", async (t) => {
    t.mock.method(JobRun, "findOneAndUpdate", async () => null);
    t.mock.method(JobRun, "create", async () => {
        const error = new Error("duplicate key");
        error.code = 11000;
        throw error;
    });
    t.mock.method(JobRun, "findOne", () => leanQuery({ status: "completed" }));

    const result = await runJob(JOB_NAMES.SUBSCRIPTION_EXPIRY);

    assert.equal(result.skipped, true);
    assert.equal(result.status, "completed");
});

test("the subscription expiry job claims, runs, and records its result", async (t) => {
    const run = { _id: objectId() };
    let finished;
    t.mock.method(JobRun, "findOneAndUpdate", async () => run);
    t.mock.method(JobRun, "updateOne", async (filter, update) => {
        finished = update.$set;
        return { modifiedCount: 1 };
    });
    t.mock.method(School, "find", () => ({ select: () => leanQuery([]) }));

    const result = await runJob(JOB_NAMES.SUBSCRIPTION_EXPIRY, { force: true });

    assert.equal(result.skipped, false);
    assert.deepEqual(result.result, { expiredTrials: 0, expiredSubscriptions: 0 });
    assert.equal(finished.status, "completed");
});

test("the fee reminder job skips safely when email delivery is not configured", async (t) => {
    const run = { _id: objectId() };
    t.mock.method(JobRun, "findOneAndUpdate", async () => run);
    t.mock.method(JobRun, "updateOne", async () => ({ modifiedCount: 1 }));

    const result = await runJob(JOB_NAMES.FEE_REMINDERS, { force: true });

    assert.equal(result.result.skipped, true);
    assert.equal(result.result.reason, "email_not_configured");
});

test("unknown scheduled jobs are rejected", async () => {
    await assert.rejects(runJob("not_a_job"), { statusCode: 404 });
});

test("student media cleanup is registered as a manual-only daily job", () => {
    const jobs = listJobs();

    const cleanup = jobs.find((job) => job.name === JOB_NAMES.STUDENT_MEDIA_CLEANUP);
    assert.ok(cleanup, "student_media_cleanup must be registered");
    assert.equal(cleanup.daily, true);
    assert.equal(cleanup.manualOnly, true);

    for (const name of [JOB_NAMES.FEE_REMINDERS, JOB_NAMES.SUBSCRIPTION_EXPIRY]) {
        const job = jobs.find((entry) => entry.name === name);
        assert.ok(job, `${name} must be registered`);
        assert.equal(job.manualOnly, false);
    }
});

test("runAllJobs never invokes the manual-only student media cleanup job", async (t) => {
    const claimedNames = [];
    const createdNames = [];
    t.mock.method(JobRun, "findOneAndUpdate", async (filter) => {
        claimedNames.push(filter.name);
        return { _id: objectId() };
    });
    t.mock.method(JobRun, "create", async (doc) => {
        createdNames.push(doc.name);
        return doc;
    });
    t.mock.method(JobRun, "updateOne", async () => ({ modifiedCount: 1 }));
    t.mock.method(School, "find", () => ({ select: () => leanQuery([]) }));

    const results = await runAllJobs({ force: true });

    assert.deepEqual(
        results.map((result) => result.name),
        [JOB_NAMES.FEE_REMINDERS, JOB_NAMES.SUBSCRIPTION_EXPIRY]
    );
    assert.equal(results.some((result) => result.name === JOB_NAMES.STUDENT_MEDIA_CLEANUP), false);
    assert.equal(claimedNames.includes(JOB_NAMES.STUDENT_MEDIA_CLEANUP), false);
    assert.equal(createdNames.includes(JOB_NAMES.STUDENT_MEDIA_CLEANUP), false);
});

test("student media cleanup is accepted when explicitly invoked", async (t) => {
    const claimedNames = [];
    t.mock.method(JobRun, "findOneAndUpdate", async (filter) => {
        claimedNames.push(filter.name);
        return { _id: objectId() };
    });
    t.mock.method(JobRun, "updateOne", async () => ({ modifiedCount: 1 }));
    // No pending cleanup tasks: the cleanup loop exits immediately without DB access.
    t.mock.method(StudentMediaCleanupTask, "findOneAndUpdate", () => leanQuery(null));
    t.mock.method(StudentMediaCleanupTask, "countDocuments", async () => 0);

    const result = await runJob(JOB_NAMES.STUDENT_MEDIA_CLEANUP, { force: true });

    assert.equal(result.skipped, false);
    assert.deepEqual(result.result, { claimed: 0, done: 0, retried: 0, failed: 0, remaining: 0 });
    assert.deepEqual(claimedNames, [JOB_NAMES.STUDENT_MEDIA_CLEANUP]);
});
