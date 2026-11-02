import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import mongoose from "mongoose";
import AuditLog from "../src/models/audit-log.model.js";
import Student from "../src/models/student.model.js";
import { validateMongoTestUri } from "../src/testing/mongo-test-safety.js";

const uri = process.env.MONGO_TEST_URI;

const makeStudent = (schoolId, admissionNumber) => {
    const [branchId, academicSessionId, classId, sectionId] = Array.from(
        { length: 4 },
        () => new mongoose.Types.ObjectId()
    );
    return {
        schoolId,
        admissionNumber,
        firstName: "Integration",
        lastName: "Student",
        dateOfBirth: new Date("2014-03-10T00:00:00.000Z"),
        admissionDate: new Date("2026-01-01T00:00:00.000Z"),
        branchId,
        academicSessionId,
        classId,
        sectionId
    };
};

test("isolated MongoDB persists tenant data, enforces indexes, supports transactions, and cleans up", {
    skip: uri ? false : "Set MONGO_TEST_URI to an isolated test-only MongoDB replica-set URI"
}, async () => {
    assert.notEqual(process.env.NODE_ENV, "production", "MongoDB integration tests cannot run with NODE_ENV=production");
    const testUri = validateMongoTestUri(uri);
    const databaseName = new mongoose.mongo.MongoClient(testUri).options.dbName;
    const suffix = randomUUID().replaceAll("-", "");
    const studentCollectionName = `students_it_${suffix}`;
    const auditCollectionName = `audit_it_${suffix}`;
    const cleanupCollectionNames = [studentCollectionName, auditCollectionName];
    let connection;

    try {
        try {
            connection = await mongoose.createConnection(testUri, {
                autoIndex: false,
                serverSelectionTimeoutMS: 8000
            }).asPromise();
        } catch {
            throw new Error("Unable to connect to the configured isolated MongoDB integration target");
        }
        assert.equal(connection.name, databaseName, "the test must use only the explicitly named test database");

        const hello = await connection.db.admin().command({ hello: 1 });
        assert.ok(hello.setName, "MongoDB transaction workflows require a replica set");

        const IntegrationStudent = connection.model(
            `IntegrationStudent_${suffix}`,
            Student.schema,
            studentCollectionName
        );
        const IntegrationAuditLog = connection.model(
            `IntegrationAuditLog_${suffix}`,
            AuditLog.schema,
            auditCollectionName
        );
        await Promise.all([
            IntegrationStudent.createIndexes(),
            IntegrationAuditLog.createIndexes()
        ]);

        const indexes = await connection.db.collection(studentCollectionName).listIndexes().toArray();
        assert.ok(indexes.some((index) =>
            index.unique
            && index.key.schoolId === 1
            && index.key.admissionNumber === 1
        ), "student admission number must be unique within a school");

        const schoolA = new mongoose.Types.ObjectId();
        const schoolB = new mongoose.Types.ObjectId();
        const sharedAdmissionNumber = `IT-${suffix.slice(0, 16)}`;
        const schoolAStudent = await IntegrationStudent.create(makeStudent(schoolA, sharedAdmissionNumber));
        const schoolBStudent = await IntegrationStudent.create(makeStudent(schoolB, sharedAdmissionNumber));

        assert.equal(
            (await IntegrationStudent.findOne({ _id: schoolAStudent._id, schoolId: schoolA })).firstName,
            "Integration"
        );
        assert.equal(
            await IntegrationStudent.findOne({ _id: schoolAStudent._id, schoolId: schoolB }),
            null,
            "a query constrained to another school must not return this student"
        );
        assert.equal(
            (await IntegrationStudent.findOne({ _id: schoolBStudent._id, schoolId: schoolB })).schoolId.toString(),
            schoolB.toString(),
            "different schools may use the same local admission number"
        );

        await assert.rejects(
            IntegrationStudent.create(makeStudent(schoolA, sharedAdmissionNumber)),
            (error) => error.code === 11000
        );
        const updateResult = await IntegrationStudent.updateOne(
            { _id: schoolAStudent._id, schoolId: schoolA },
            { $set: { lastName: "Updated" } }
        );
        assert.equal(updateResult.modifiedCount, 1);
        assert.equal(
            (await IntegrationStudent.findOne({ _id: schoolAStudent._id, schoolId: schoolA })).lastName,
            "Updated"
        );

        const deleteResult = await IntegrationStudent.deleteOne({
            _id: schoolAStudent._id,
            schoolId: schoolA
        });
        assert.equal(deleteResult.deletedCount, 1);
        assert.equal(await IntegrationStudent.findById(schoolAStudent._id), null);
        assert.equal(
            await IntegrationStudent.countDocuments({ schoolId: schoolB, admissionNumber: sharedAdmissionNumber }),
            1,
            "deleting a tenant record must not affect another school's record"
        );

        const transactionSession = await connection.startSession();
        const committedStudent = makeStudent(schoolA, `TX-${suffix.slice(0, 16)}`);
        const committedAudit = {
            schoolId: schoolA,
            action: "integration.student.created",
            resourceType: "student",
            metadata: { testRun: suffix }
        };
        try {
            await transactionSession.withTransaction(async () => {
                await IntegrationStudent.create([committedStudent], { session: transactionSession });
                await IntegrationAuditLog.create([committedAudit], { session: transactionSession });
            });
        } finally {
            await transactionSession.endSession();
        }
        const committedRecord = await IntegrationStudent.findOne({
            schoolId: schoolA,
            admissionNumber: committedStudent.admissionNumber
        });
        assert.ok(committedRecord, "transaction commit must persist the student");
        assert.equal(
            await IntegrationAuditLog.countDocuments({ schoolId: schoolA, "metadata.testRun": suffix }),
            1,
            "transaction commit must persist the corresponding audit event"
        );

        const abortedAdmission = `AB-${suffix.slice(0, 16)}`;
        const rollbackSession = await connection.startSession();
        try {
            await assert.rejects(rollbackSession.withTransaction(async () => {
                await IntegrationStudent.create(
                    [makeStudent(schoolA, abortedAdmission)],
                    { session: rollbackSession }
                );
                await IntegrationAuditLog.create([{
                    schoolId: schoolA,
                    action: "integration.student.rollback",
                    resourceType: "student",
                    metadata: { testRun: suffix }
                }], { session: rollbackSession });
                throw new Error("intentional integration transaction rollback");
            }), /intentional integration transaction rollback/);
        } finally {
            await rollbackSession.endSession();
        }
        assert.equal(
            await IntegrationStudent.countDocuments({ schoolId: schoolA, admissionNumber: abortedAdmission }),
            0,
            "aborted transactions must not leave the student record"
        );
        assert.equal(
            await IntegrationAuditLog.countDocuments({ schoolId: schoolA, action: "integration.student.rollback" }),
            0,
            "aborted transactions must not leave the audit record"
        );
    } finally {
        if (connection) {
            try {
                const existing = await connection.db.listCollections({}, { nameOnly: true }).toArray();
                const existingNames = new Set(existing.map(({ name }) => name));
                for (const collectionName of cleanupCollectionNames) {
                    if (existingNames.has(collectionName)) {
                        await connection.dropCollection(collectionName);
                    }
                }
                const remaining = await connection.db.listCollections({}, { nameOnly: true }).toArray();
                assert.equal(
                    remaining.some(({ name }) => cleanupCollectionNames.includes(name)),
                    false,
                    "the test must remove its own uniquely named collections"
                );
            } finally {
                await connection.close();
            }
        }
    }
});
