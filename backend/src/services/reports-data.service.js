import mongoose from "mongoose";
import AcademicClass from "../models/academic-class.model.js";
import AcademicSession from "../models/academic-session.model.js";
import ClassSubject from "../models/class-subject.model.js";
import Exam from "../models/exam.model.js";
import ExamMark from "../models/exam-mark.model.js";
import FeePayment from "../models/fee-payment.model.js";
import FeeVoucher from "../models/fee-voucher.model.js";
import Section from "../models/section.model.js";
import Student from "../models/student.model.js";
import StudentAttendance from "../models/student-attendance.model.js";
import Subject from "../models/subject.model.js";
import { HttpError } from "../utils/http-error.js";

const assertTenant = (req) => {
    if (!req.user?.schoolId || !req.school
        || String(req.user.schoolId) !== String(req.school._id)) {
        throw new HttpError(403, "A matching school tenant context is required");
    }
    return req.user.schoolId;
};

const objectId = (value) => new mongoose.Types.ObjectId(value);
const utcDayStart = (value) => new Date(`${value}T00:00:00.000Z`);
const dayAfter = (value) => {
    const date = utcDayStart(value);
    date.setUTCDate(date.getUTCDate() + 1);
    return date;
};
const dateFilter = (input, field) => input.from || input.to
    ? {
        [field]: {
            ...(input.from && { $gte: utcDayStart(input.from) }),
            ...(input.to && { $lt: dayAfter(input.to) })
        }
    }
    : {};
const pageInfo = (page, limit, total) => ({
    page,
    limit,
    total,
    pages: Math.ceil(total / limit)
});

const toName = (student) => `${student.firstName} ${student.lastName}`.trim();

export const getStudentRecords = async (req, input) => {
    const schoolId = assertTenant(req);
    const filter = {
        schoolId,
        ...dateFilter(input, "admissionDate"),
        ...(input.classId && { classId: objectId(input.classId) }),
        ...(input.academicSessionId && { academicSessionId: objectId(input.academicSessionId) }),
        ...(input.studentId && { _id: objectId(input.studentId) }),
        ...(input.status && { status: input.status })
    };
    const [students, total] = await Promise.all([
        Student.find(filter)
            .select("_id admissionNumber firstName lastName status admissionDate academicSessionId classId sectionId")
            .sort({ lastName: 1, firstName: 1, _id: 1 })
            .skip((input.page - 1) * input.limit)
            .limit(input.limit)
            .lean(),
        Student.countDocuments(filter)
    ]);
    const [classes, sessions, sections] = await Promise.all([
        AcademicClass.find({ schoolId, _id: { $in: students.map((student) => student.classId) } })
            .select("_id name").lean(),
        AcademicSession.find({ schoolId, _id: { $in: students.map((student) => student.academicSessionId) } })
            .select("_id name").lean(),
        Section.find({ schoolId, _id: { $in: students.map((student) => student.sectionId) } })
            .select("_id name").lean()
    ]);
    const classNames = new Map(classes.map((item) => [String(item._id), item.name]));
    const sessionNames = new Map(sessions.map((item) => [String(item._id), item.name]));
    const sectionNames = new Map(sections.map((item) => [String(item._id), item.name]));
    return {
        items: students.map((student) => ({
            studentId: String(student._id),
            admissionNumber: student.admissionNumber,
            name: toName(student),
            status: student.status,
            admissionDate: student.admissionDate,
            academicSession: sessionNames.get(String(student.academicSessionId)) ?? "",
            class: classNames.get(String(student.classId)) ?? "",
            section: sectionNames.get(String(student.sectionId)) ?? ""
        })),
        pagination: pageInfo(input.page, input.limit, total)
    };
};

export const getAttendanceRecords = async (req, input) => {
    const schoolId = assertTenant(req);
    const filter = {
        schoolId,
        ...dateFilter(input, "date"),
        ...(input.academicSessionId && { academicSessionId: objectId(input.academicSessionId) }),
        ...(input.studentId && { studentId: objectId(input.studentId) }),
        ...(input.status && { status: input.status })
    };
    if (input.classId) {
        const sectionIds = await Section.distinct("_id", {
            schoolId,
            classId: objectId(input.classId),
            ...(input.academicSessionId && { academicSessionId: objectId(input.academicSessionId) })
        });
        filter.sectionId = { $in: sectionIds };
    }
    const [records, total] = await Promise.all([
        StudentAttendance.find(filter)
            .select("_id studentId academicSessionId sectionId date status")
            .sort({ date: -1, _id: 1 })
            .skip((input.page - 1) * input.limit)
            .limit(input.limit)
            .lean(),
        StudentAttendance.countDocuments(filter)
    ]);
    const [students, sections, sessions] = await Promise.all([
        Student.find({ schoolId, _id: { $in: records.map((record) => record.studentId) } })
            .select("_id admissionNumber firstName lastName").lean(),
        Section.find({ schoolId, _id: { $in: records.map((record) => record.sectionId) } })
            .select("_id name classId").lean(),
        AcademicSession.find({ schoolId, _id: { $in: records.map((record) => record.academicSessionId) } })
            .select("_id name").lean()
    ]);
    const studentMap = new Map(students.map((item) => [String(item._id), item]));
    const sectionMap = new Map(sections.map((item) => [String(item._id), item]));
    const sessionMap = new Map(sessions.map((item) => [String(item._id), item]));
    const classes = await AcademicClass.find({
        schoolId,
        _id: { $in: sections.map((section) => section.classId) }
    }).select("_id name").lean();
    const classNames = new Map(classes.map((item) => [String(item._id), item.name]));
    return {
        items: records.flatMap((record) => {
            const student = studentMap.get(String(record.studentId));
            const section = sectionMap.get(String(record.sectionId));
            if (!student || !section) return [];
            return [{
                attendanceId: String(record._id),
                date: record.date,
                status: record.status,
                admissionNumber: student.admissionNumber,
                studentName: toName(student),
                className: classNames.get(String(section.classId)) ?? "",
                sectionName: section.name,
                academicSession: sessionMap.get(String(record.academicSessionId))?.name ?? ""
            }];
        }),
        pagination: pageInfo(input.page, input.limit, total)
    };
};

const paymentDetailsPipeline = (schoolId, input) => [
    { $match: {
        schoolId,
        ...dateFilter(input, "receivedAt"),
        ...(input.studentId && { studentId: objectId(input.studentId) }),
        ...(input.method && { method: input.method })
    } },
    { $lookup: {
        from: FeeVoucher.collection.name,
        localField: "voucherId",
        foreignField: "_id",
        as: "voucher"
    } },
    { $unwind: "$voucher" },
    { $match: {
        "voucher.schoolId": schoolId,
        ...(input.classId && { "voucher.classId": objectId(input.classId) })
    } },
    { $lookup: {
        from: Student.collection.name,
        localField: "studentId",
        foreignField: "_id",
        pipeline: [
            { $match: { schoolId } },
            { $project: { admissionNumber: 1, firstName: 1, lastName: 1 } }
        ],
        as: "student"
    } },
    { $unwind: "$student" },
    { $lookup: {
        from: AcademicClass.collection.name,
        localField: "voucher.classId",
        foreignField: "_id",
        pipeline: [
            { $match: { schoolId } },
            { $project: { name: 1 } }
        ],
        as: "class"
    } },
    { $unwind: { path: "$class", preserveNullAndEmptyArrays: true } }
];

export const getFeeCollectionRecords = async (req, input) => {
    const schoolId = assertTenant(req);
    const pipeline = paymentDetailsPipeline(schoolId, input);
    const [items, totals] = await Promise.all([
        FeePayment.aggregate([
            ...pipeline,
            { $sort: { receivedAt: -1, _id: 1 } },
            { $skip: (input.page - 1) * input.limit },
            { $limit: input.limit },
            { $project: {
                _id: 0,
                receiptNumber: 1,
                receivedAt: 1,
                admissionNumber: "$student.admissionNumber",
                studentName: { $concat: ["$student.firstName", " ", "$student.lastName"] },
                className: "$class.name",
                period: "$voucher.period",
                amountMinor: 1,
                currency: 1,
                method: 1
            } }
        ]),
        FeePayment.aggregate([...pipeline, { $count: "total" }])
    ]);
    const total = totals[0]?.total ?? 0;
    return { items, pagination: pageInfo(input.page, input.limit, total) };
};

const voucherDetailsPipeline = (schoolId, input) => [
    { $match: {
        schoolId,
        balanceMinor: { $gt: 0 },
        ...dateFilter(input, "dueDate"),
        ...(input.classId && { classId: objectId(input.classId) }),
        ...(input.studentId && { studentId: objectId(input.studentId) }),
        ...(input.status && { status: input.status })
    } },
    { $lookup: {
        from: Student.collection.name,
        localField: "studentId",
        foreignField: "_id",
        pipeline: [
            { $match: { schoolId } },
            { $project: { admissionNumber: 1, firstName: 1, lastName: 1 } }
        ],
        as: "student"
    } },
    { $unwind: "$student" },
    { $lookup: {
        from: AcademicClass.collection.name,
        localField: "classId",
        foreignField: "_id",
        pipeline: [
            { $match: { schoolId } },
            { $project: { name: 1 } }
        ],
        as: "class"
    } },
    { $unwind: { path: "$class", preserveNullAndEmptyArrays: true } }
];

export const getFeeDueRecords = async (req, input) => {
    const schoolId = assertTenant(req);
    const pipeline = voucherDetailsPipeline(schoolId, input);
    const [items, totals] = await Promise.all([
        FeeVoucher.aggregate([
            ...pipeline,
            { $sort: { dueDate: 1, _id: 1 } },
            { $skip: (input.page - 1) * input.limit },
            { $limit: input.limit },
            { $project: {
                _id: 0,
                admissionNumber: "$student.admissionNumber",
                studentName: { $concat: ["$student.firstName", " ", "$student.lastName"] },
                className: "$class.name",
                period: 1,
                dueDate: 1,
                balanceMinor: 1,
                currency: 1,
                status: 1
            } }
        ]),
        FeeVoucher.aggregate([...pipeline, { $count: "total" }])
    ]);
    const total = totals[0]?.total ?? 0;
    return { items, pagination: pageInfo(input.page, input.limit, total) };
};

export const getClassSessionRecords = async (req, input) => {
    const schoolId = assertTenant(req);
    const match = {
        schoolId,
        ...(input.classId && { classId: objectId(input.classId) }),
        ...(input.academicSessionId && { academicSessionId: objectId(input.academicSessionId) })
    };
    const grouped = await Student.aggregate([
        { $match: match },
        { $group: {
            _id: {
                classId: "$classId",
                academicSessionId: "$academicSessionId",
                status: "$status"
            },
            count: { $sum: 1 }
        } },
        { $sort: { "_id.academicSessionId": 1, "_id.classId": 1, "_id.status": 1 } }
    ]);
    const classIds = [...new Set(grouped.map((item) => String(item._id.classId)))];
    const sessionIds = [...new Set(grouped.map((item) => String(item._id.academicSessionId)))];
    const [classes, sessions] = await Promise.all([
        AcademicClass.find({ schoolId, _id: { $in: classIds } }).select("_id name").lean(),
        AcademicSession.find({ schoolId, _id: { $in: sessionIds } }).select("_id name").lean()
    ]);
    const classMap = new Map(classes.map((item) => [String(item._id), item.name]));
    const sessionMap = new Map(sessions.map((item) => [String(item._id), item.name]));
    const rows = new Map();
    for (const item of grouped) {
        const classId = String(item._id.classId);
        const academicSessionId = String(item._id.academicSessionId);
        if (!classMap.has(classId) || !sessionMap.has(academicSessionId)) continue;
        const key = `${academicSessionId}:${classId}`;
        if (!rows.has(key)) {
            rows.set(key, {
                classId,
                className: classMap.get(classId),
                academicSessionId,
                academicSession: sessionMap.get(academicSessionId),
                enrolled: 0,
                byStatus: { enrolled: 0, withdrawn: 0, transferred: 0, graduated: 0 }
            });
        }
        const row = rows.get(key);
        row.byStatus[item._id.status] = item.count;
        row.enrolled = row.byStatus.enrolled;
    }
    const allRows = [...rows.values()];
    const start = (input.page - 1) * input.limit;
    return {
        items: allRows.slice(start, start + input.limit),
        pagination: pageInfo(input.page, input.limit, allRows.length)
    };
};

export const getExamResultRecords = async (req, input) => {
    const schoolId = assertTenant(req);
    const examFilter = {
        schoolId,
        status: "published",
        ...(input.classId && { classId: objectId(input.classId) }),
        ...(input.academicSessionId && { academicSessionId: objectId(input.academicSessionId) })
    };
    if (input.from || input.to) {
        examFilter.subjects = { $elemMatch: {
            examDate: {
                ...(input.from && { $gte: utcDayStart(input.from) }),
                ...(input.to && { $lt: dayAfter(input.to) })
            }
        } };
    }
    const exams = await Exam.find(examFilter)
        .select("_id name classId academicSessionId gradingScale subjects")
        .lean();
    if (!exams.length) return { items: [], pagination: pageInfo(input.page, input.limit, 0) };

    const examIds = exams.map((exam) => exam._id);
    const marks = await ExamMark.find({
        schoolId,
        examId: { $in: examIds },
        ...(input.studentId && { studentId: objectId(input.studentId) })
    }).select("examId studentId classSubjectId marksObtained").lean();
    const [students, classes, sessions] = await Promise.all([
        Student.find({ schoolId, _id: { $in: marks.map((mark) => mark.studentId) } })
            .select("_id admissionNumber firstName lastName").lean(),
        AcademicClass.find({ schoolId, _id: { $in: exams.map((exam) => exam.classId) } })
            .select("_id name").lean(),
        AcademicSession.find({ schoolId, _id: { $in: exams.map((exam) => exam.academicSessionId) } })
            .select("_id name").lean()
    ]);
    const classSubjectIds = [...new Set(exams.flatMap((exam) =>
        exam.subjects.map((schedule) => String(schedule.classSubjectId))))];
    const classSubjects = await ClassSubject.find({
        schoolId,
        _id: { $in: classSubjectIds }
    }).select("_id subjectId").lean();
    const subjectIds = classSubjects.map((item) => item.subjectId);
    const subjects = await Subject.find({ schoolId, _id: { $in: subjectIds } })
        .select("_id name").lean();
    const examMap = new Map(exams.map((exam) => [String(exam._id), exam]));
    const studentMap = new Map(students.map((student) => [String(student._id), student]));
    const classMap = new Map(classes.map((item) => [String(item._id), item.name]));
    const sessionMap = new Map(sessions.map((item) => [String(item._id), item.name]));
    const subjectMap = new Map(subjects.map((item) => [String(item._id), item.name]));
    const classSubjectMap = new Map(classSubjects.map((item) => [String(item._id), item]));
    const rows = [];
    for (const mark of marks) {
        const exam = examMap.get(String(mark.examId));
        const student = studentMap.get(String(mark.studentId));
        const schedule = exam?.subjects.find((item) =>
            String(item.classSubjectId) === String(mark.classSubjectId));
        const classSubject = classSubjectMap.get(String(mark.classSubjectId));
        const subjectName = classSubject && subjectMap.get(String(classSubject.subjectId));
        if (!exam || !student || !schedule || !subjectName) continue;
        if ((input.from && schedule.examDate < utcDayStart(input.from))
            || (input.to && schedule.examDate >= dayAfter(input.to))) continue;
        const percent = Math.round((mark.marksObtained / schedule.maxMarks) * 10000) / 100;
        const passed = mark.marksObtained >= schedule.passingMarks;
        const status = passed ? "passed" : "failed";
        if (input.status && input.status !== status) continue;
        rows.push({
            examName: exam.name,
            examDate: schedule.examDate,
            academicSession: sessionMap.get(String(exam.academicSessionId)) ?? "",
            className: classMap.get(String(exam.classId)) ?? "",
            admissionNumber: student.admissionNumber,
            studentName: toName(student),
            subject: subjectName,
            marksObtained: mark.marksObtained,
            maxMarks: schedule.maxMarks,
            passingMarks: schedule.passingMarks,
            grade: exam.gradingScale.find((band, index) =>
                percent >= band.minPercent
                && (percent < band.maxPercent || index === exam.gradingScale.length - 1))?.grade ?? "",
            status
        });
    }
    rows.sort((a, b) => b.examDate - a.examDate
        || a.className.localeCompare(b.className)
        || a.studentName.localeCompare(b.studentName)
        || a.subject.localeCompare(b.subject));
    const start = (input.page - 1) * input.limit;
    return {
        items: rows.slice(start, start + input.limit),
        pagination: pageInfo(input.page, input.limit, rows.length)
    };
};
