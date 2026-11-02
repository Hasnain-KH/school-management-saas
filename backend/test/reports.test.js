import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.MONGO_URI = "mongodb://127.0.0.1:27017/schoolflow-test";

const { default: Student } = await import("../src/models/student.model.js");
const { default: AcademicClass } = await import("../src/models/academic-class.model.js");
const { default: AcademicSession } = await import("../src/models/academic-session.model.js");
const { default: Section } = await import("../src/models/section.model.js");
const { default: FeePayment } = await import("../src/models/fee-payment.model.js");
const { default: FeeVoucher } = await import("../src/models/fee-voucher.model.js");
const { default: Exam } = await import("../src/models/exam.model.js");
const { default: ExamMark } = await import("../src/models/exam-mark.model.js");
const { default: ClassSubject } = await import("../src/models/class-subject.model.js");
const { default: Subject } = await import("../src/models/subject.model.js");
const { default: StudentAttendance } = await import("../src/models/student-attendance.model.js");
const {
    getStudentRecords,
    getAttendanceRecords,
    getFeeCollectionRecords,
    getFeeDueRecords,
    getClassSessionRecords,
    getExamResultRecords
} =
    await import("../src/services/reports-data.service.js");
const {
    studentRecordsQuerySchema,
    attendanceRecordsQuerySchema,
    feeCollectionRecordsQuerySchema,
    feeDueRecordsQuerySchema,
    examResultRecordsQuerySchema
} = await import("../src/validators/reports.validator.js");
const { hasPermission } = await import("../src/middleware/authorization.middleware.js");

const schoolId = "64a000000000000000000001";
const classId = "64a000000000000000000002";
const sessionId = "64a000000000000000000003";
const studentId = "64a000000000000000000004";
const requestFor = (id = schoolId) => ({
    user: { schoolId: id },
    school: { _id: id }
});
const query = (value) => ({
    select() { return this; },
    sort() { return this; },
    skip() { return this; },
    limit() { return this; },
    lean: async () => value
});

test("report access remains limited to school admins and principals", () => {
    assert.equal(hasPermission("school_admin", "reports:read"), true);
    assert.equal(hasPermission("principal", "reports:read"), true);
    assert.equal(hasPermission("teacher", "reports:read"), false);
    assert.equal(hasPermission("parent", "reports:read"), false);
});

test("report query schemas validate filters, dates, status, and pagination", () => {
    assert.equal(studentRecordsQuerySchema.safeParse({
        from: "2026-01-01",
        to: "2026-12-31",
        classId,
        academicSessionId: sessionId,
        studentId,
        status: "enrolled",
        page: "2",
        limit: "100"
    }).success, true);
    assert.equal(attendanceRecordsQuerySchema.safeParse({ status: "holiday" }).success, false);
    assert.equal(feeCollectionRecordsQuerySchema.safeParse({ method: "card" }).success, false);
    assert.equal(feeDueRecordsQuerySchema.safeParse({ status: "paid" }).success, false);
    assert.equal(examResultRecordsQuerySchema.safeParse({
        from: "2025-01-01",
        to: "2026-02-01"
    }).success, false);
    assert.equal(studentRecordsQuerySchema.safeParse({ unknown: "filter" }).success, false);
});

test("student report applies tenant, class, session, date, and status filters", async (t) => {
    let studentFilter;
    t.mock.method(Student, "find", (filter) => {
        studentFilter = filter;
        return query([{
            _id: studentId,
            admissionNumber: "ST-001",
            firstName: "Ada",
            lastName: "Lovelace",
            status: "enrolled",
            admissionDate: new Date("2026-02-01T00:00:00.000Z"),
            academicSessionId: sessionId,
            classId,
            sectionId: "64a000000000000000000005"
        }]);
    });
    t.mock.method(Student, "countDocuments", async (filter) => {
        assert.equal(String(filter.schoolId), schoolId);
        return 1;
    });
    t.mock.method(AcademicClass, "find", (filter) => {
        assert.equal(String(filter.schoolId), schoolId);
        return query([{ _id: classId, name: "Grade 1" }]);
    });
    t.mock.method(AcademicSession, "find", (filter) => {
        assert.equal(String(filter.schoolId), schoolId);
        return query([{ _id: sessionId, name: "2026-27" }]);
    });
    t.mock.method(Section, "find", (filter) => {
        assert.equal(String(filter.schoolId), schoolId);
        return query([{ _id: "64a000000000000000000005", name: "A" }]);
    });

    const result = await getStudentRecords(requestFor(), {
        from: "2026-01-01",
        to: "2026-12-31",
        classId,
        academicSessionId: sessionId,
        status: "enrolled",
        page: 1,
        limit: 25
    });
    assert.equal(String(studentFilter.schoolId), schoolId);
    assert.equal(String(studentFilter.classId), classId);
    assert.equal(String(studentFilter.academicSessionId), sessionId);
    assert.equal(studentFilter.status, "enrolled");
    assert.deepEqual(studentFilter.admissionDate, {
        $gte: new Date("2026-01-01T00:00:00.000Z"),
        $lt: new Date("2027-01-01T00:00:00.000Z")
    });
    assert.equal(result.items[0].name, "Ada Lovelace");
    assert.equal(result.items[0].class, "Grade 1");
    assert.equal(result.items[0].academicSession, "2026-27");
    assert.equal(result.items[0].section, "A");
    assert.equal(result.pagination.total, 1);
});

test("attendance report constrains class lookup and records to the school", async (t) => {
    let attendanceFilter;
    t.mock.method(Section, "distinct", async (field, filter) => {
        assert.equal(field, "_id");
        assert.equal(String(filter.schoolId), schoolId);
        assert.equal(String(filter.classId), classId);
        return ["64a000000000000000000005"];
    });
    t.mock.method(StudentAttendance, "find", (filter) => {
        attendanceFilter = filter;
        return query([]);
    });
    t.mock.method(StudentAttendance, "countDocuments", async (filter) => {
        assert.equal(String(filter.schoolId), schoolId);
        return 0;
    });
    t.mock.method(Student, "find", (filter) => {
        assert.equal(String(filter.schoolId), schoolId);
        return query([]);
    });
    t.mock.method(Section, "find", (filter) => {
        assert.equal(String(filter.schoolId), schoolId);
        return query([]);
    });
    t.mock.method(AcademicSession, "find", (filter) => {
        assert.equal(String(filter.schoolId), schoolId);
        return query([]);
    });
    t.mock.method(AcademicClass, "find", (filter) => {
        assert.equal(String(filter.schoolId), schoolId);
        return query([]);
    });

    await getAttendanceRecords(requestFor(), {
        from: "2026-02-01",
        to: "2026-02-28",
        classId,
        status: "present",
        page: 1,
        limit: 25
    });
    assert.equal(String(attendanceFilter.schoolId), schoolId);
    assert.deepEqual(attendanceFilter.sectionId.$in, ["64a000000000000000000005"]);
    assert.equal(attendanceFilter.status, "present");
});

test("fee collection report scopes payments and joined records while applying filters", async (t) => {
    const seen = [];
    t.mock.method(FeePayment, "aggregate", async (pipeline) => {
        seen.push(pipeline);
        return pipeline.at(-1).$count ? [{ total: 1 }] : [{
            receiptNumber: "RCPT-001",
            studentName: "Ada Lovelace",
            amountMinor: 12500
        }];
    });
    const result = await getFeeCollectionRecords(requestFor(), {
        from: "2026-01-01",
        to: "2026-01-31",
        classId,
        studentId,
        method: "cash",
        page: 1,
        limit: 25
    });
    for (const pipeline of seen) {
        assert.equal(String(pipeline[0].$match.schoolId), schoolId);
        assert.equal(String(pipeline[0].$match.studentId), studentId);
        assert.equal(pipeline[0].$match.method, "cash");
        assert.equal(String(pipeline[3].$match["voucher.classId"]), classId);
        const studentLookup = pipeline.find((stage) => stage.$lookup?.from === Student.collection.name);
        assert.equal(String(studentLookup.$lookup.pipeline[0].$match.schoolId), schoolId);
    }
    assert.equal(result.items[0].receiptNumber, "RCPT-001");
    assert.equal(result.pagination.total, 1);
});

test("outstanding dues report applies school, date, class, student, and status filters", async (t) => {
    const seen = [];
    t.mock.method(FeeVoucher, "aggregate", async (pipeline) => {
        seen.push(pipeline);
        return pipeline.at(-1).$count ? [{ total: 1 }] : [{
            admissionNumber: "ST-001",
            studentName: "Ada Lovelace",
            balanceMinor: 12500,
            status: "partial"
        }];
    });
    const result = await getFeeDueRecords(requestFor(), {
        from: "2026-01-01",
        to: "2026-01-31",
        classId,
        studentId,
        status: "partial",
        page: 1,
        limit: 25
    });
    for (const pipeline of seen) {
        const filter = pipeline[0].$match;
        assert.equal(String(filter.schoolId), schoolId);
        assert.equal(filter.balanceMinor.$gt, 0);
        assert.equal(String(filter.classId), classId);
        assert.equal(String(filter.studentId), studentId);
        assert.equal(filter.status, "partial");
        assert.ok(filter.dueDate.$gte);
        assert.ok(filter.dueDate.$lt);
        const studentLookup = pipeline.find((stage) => stage.$lookup?.from === Student.collection.name);
        assert.equal(String(studentLookup.$lookup.pipeline[0].$match.schoolId), schoolId);
    }
    assert.equal(result.items[0].status, "partial");
    assert.equal(result.pagination.total, 1);
});

test("class and session enrollment reports scope aggregation and referenced labels", async (t) => {
    t.mock.method(Student, "aggregate", async (pipeline) => {
        assert.equal(String(pipeline[0].$match.schoolId), schoolId);
        assert.equal(String(pipeline[0].$match.classId), classId);
        assert.equal(String(pipeline[0].$match.academicSessionId), sessionId);
        return [
            { _id: { classId, academicSessionId: sessionId, status: "enrolled" }, count: 8 },
            { _id: { classId, academicSessionId: sessionId, status: "withdrawn" }, count: 2 }
        ];
    });
    t.mock.method(AcademicClass, "find", (filter) => {
        assert.equal(String(filter.schoolId), schoolId);
        return query([{ _id: classId, name: "Grade 1" }]);
    });
    t.mock.method(AcademicSession, "find", (filter) => {
        assert.equal(String(filter.schoolId), schoolId);
        return query([{ _id: sessionId, name: "2026-27" }]);
    });

    const result = await getClassSessionRecords(requestFor(), {
        classId,
        academicSessionId: sessionId,
        page: 1,
        limit: 25
    });
    assert.deepEqual(result.items[0], {
        classId,
        className: "Grade 1",
        academicSessionId: sessionId,
        academicSession: "2026-27",
        enrolled: 8,
        byStatus: { enrolled: 8, withdrawn: 2, transferred: 0, graduated: 0 }
    });
    assert.equal(result.pagination.total, 1);
});

test("published results are filtered and joined only through tenant-scoped records", async (t) => {
    const examId = "64a000000000000000000006";
    const classSubjectId = "64a000000000000000000007";
    const subjectId = "64a000000000000000000008";
    const examDate = new Date("2026-05-10T00:00:00.000Z");
    t.mock.method(Exam, "find", (filter) => {
        assert.equal(String(filter.schoolId), schoolId);
        assert.equal(filter.status, "published");
        assert.equal(String(filter.classId), classId);
        assert.equal(String(filter.academicSessionId), sessionId);
        assert.ok(filter.subjects.$elemMatch.examDate.$gte);
        return query([{
            _id: examId,
            name: "Final",
            classId,
            academicSessionId: sessionId,
            gradingScale: [{ minPercent: 0, maxPercent: 60, grade: "F" }, { minPercent: 60, maxPercent: 100, grade: "A" }],
            subjects: [{ classSubjectId, subjectId, examDate, maxMarks: 100, passingMarks: 40 }]
        }]);
    });
    t.mock.method(ExamMark, "find", (filter) => {
        assert.equal(String(filter.schoolId), schoolId);
        assert.equal(String(filter.studentId), studentId);
        return query([{ examId, studentId, classSubjectId, marksObtained: 80 }]);
    });
    t.mock.method(Student, "find", (filter) => {
        assert.equal(String(filter.schoolId), schoolId);
        return query([{ _id: studentId, admissionNumber: "ST-001", firstName: "Ada", lastName: "Lovelace" }]);
    });
    t.mock.method(AcademicClass, "find", (filter) => {
        assert.equal(String(filter.schoolId), schoolId);
        return query([{ _id: classId, name: "Grade 1" }]);
    });
    t.mock.method(AcademicSession, "find", (filter) => {
        assert.equal(String(filter.schoolId), schoolId);
        return query([{ _id: sessionId, name: "2026-27" }]);
    });
    t.mock.method(ClassSubject, "find", (filter) => {
        assert.equal(String(filter.schoolId), schoolId);
        return query([{ _id: classSubjectId, subjectId }]);
    });
    t.mock.method(Subject, "find", (filter) => {
        assert.equal(String(filter.schoolId), schoolId);
        return query([{ _id: subjectId, name: "Mathematics" }]);
    });

    const result = await getExamResultRecords(requestFor(), {
        from: "2026-05-01",
        to: "2026-05-31",
        classId,
        academicSessionId: sessionId,
        studentId,
        status: "passed",
        page: 1,
        limit: 25
    });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].subject, "Mathematics");
    assert.equal(result.items[0].grade, "A");
    assert.equal(result.items[0].status, "passed");
    assert.equal(result.pagination.total, 1);
});

test("report data services reject mismatched tenant context", async () => {
    await assert.rejects(getStudentRecords({ user: { schoolId }, school: { _id: classId } }, {
        page: 1,
        limit: 25
    }), { statusCode: 403 });
});
