import AcademicSession from "../models/academic-session.model.js";
import AuditLog from "../models/audit-log.model.js";
import ClassSubject from "../models/class-subject.model.js";
import ClassTeacherAssignment from "../models/class-teacher-assignment.model.js";
import School from "../models/school.model.js";
import Section from "../models/section.model.js";
import StaffAttendance from "../models/staff-attendance.model.js";
import Student from "../models/student.model.js";
import StudentAttendance from "../models/student-attendance.model.js";
import User from "../models/user.model.js";
import { HttpError } from "../utils/http-error.js";
import { withTransaction } from "../utils/transaction.js";

const assertTenant = (req) => {
    if (!req.user?.schoolId || !req.school
        || String(req.user.schoolId) !== String(req.school._id)) {
        throw new HttpError(403, "A matching school tenant context is required");
    }
    return req.user.schoolId;
};

const toUtcDate = (day) => new Date(`${day}T00:00:00.000Z`);
const monthRange = (month) => {
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    return { $gte: start, $lt: end };
};
const toMinutes = (time) => {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
};

const createAudit = async (req, session, action, resourceType, metadata) => {
    const audit = new AuditLog({
        schoolId: assertTenant(req),
        actorUserId: req.user._id,
        action,
        resourceType,
        metadata
    });
    await audit.save({ session });
};

const assertSectionAccess = async (req, sectionId, session) => {
    const schoolId = assertTenant(req);
    const section = await Section.findOne({ _id: sectionId, schoolId, isActive: true }).session(session);
    if (!section) throw new HttpError(404, "Active section was not found in this school");

    if (req.user.role === "teacher") {
        const [classTeacher, subjectTeacher] = await Promise.all([
            ClassTeacherAssignment.exists({
                schoolId,
                academicSessionId: section.academicSessionId,
                sectionId,
                teacherId: req.user._id
            }).session(session),
            ClassSubject.exists({
                schoolId,
                academicSessionId: section.academicSessionId,
                classId: section.classId,
                teacherId: req.user._id,
                isActive: true
            }).session(session)
        ]);
        if (!classTeacher && !subjectTeacher) {
            throw new HttpError(403, "Teachers may only access attendance for their assigned classes");
        }
    }

    const academicSession = await AcademicSession.findOne({
        _id: section.academicSessionId,
        schoolId
    }).session(session);
    if (!academicSession) throw new HttpError(409, "Section academic session was not found");
    return { section, academicSession };
};

const assertDateInSession = (date, academicSession) => {
    const day = toUtcDate(date);
    const sessionStart = toUtcDate(academicSession.startDate.toISOString().slice(0, 10));
    const sessionEnd = toUtcDate(academicSession.endDate.toISOString().slice(0, 10));
    if (day < sessionStart || day > sessionEnd) {
        throw new HttpError(400, "Attendance date must fall within the section's academic session");
    }
    return day;
};

const normalizeStatus = (status, checkIn, school) => {
    if (!["present", "late"].includes(status)) return status;
    if (!checkIn) {
        if (status === "late") throw new HttpError(400, "Late attendance requires a check-in time");
        return status;
    }
    const lateAfter = toMinutes(school.settings?.attendanceStartTime ?? "08:00")
        + (school.settings?.attendanceLateGraceMinutes ?? 10);
    const isLate = toMinutes(checkIn) > lateAfter;
    if (status === "late" && !isLate) {
        throw new HttpError(400, "Check-in time is within the configured on-time grace period");
    }
    return isLate ? "late" : "present";
};

const mapAttendance = (record) => ({
    id: record._id.toString(),
    date: record.date.toISOString().slice(0, 10),
    status: record.status,
    checkIn: record.checkIn,
    checkOut: record.checkOut,
    note: record.note,
    markedBy: record.markedBy.toString(),
    updatedAt: record.updatedAt
});

const attendanceUpdate = (record, fields) => {
    const $set = { ...fields };
    const $unset = {};
    for (const field of ["checkIn", "checkOut", "note"]) {
        if (record[field] === undefined) {
            $unset[field] = 1;
        } else {
            $set[field] = record[field];
        }
    }
    const update = { $set };
    if (Object.keys($unset).length) update.$unset = $unset;
    return update;
};

const writeAttendance = async (Model, operations, options) => {
    try {
        return await Model.bulkWrite(operations, options);
    } catch (error) {
        if (error?.code === 11000) {
            throw new HttpError(409, "Attendance was concurrently recorded; reload the sheet and try again");
        }
        throw error;
    }
};

export const markStudentAttendance = async (req, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const { section, academicSession } = await assertSectionAccess(req, input.sectionId, session);
        const date = assertDateInSession(input.date, academicSession);
        const school = await School.findById(schoolId).session(session);
        if (!school) throw new HttpError(404, "School was not found");

        const studentIds = input.records.map(({ studentId }) => studentId);
        const enrolledStudents = await Student.find({
            schoolId,
            sectionId: section._id,
            academicSessionId: section.academicSessionId,
            status: "enrolled",
            _id: { $in: studentIds }
        }).select("_id").session(session).lean();
        if (enrolledStudents.length !== studentIds.length) {
            throw new HttpError(404, "One or more students are not enrolled in this section");
        }

        const operations = input.records.map((record) => ({
            updateOne: {
                filter: { schoolId, studentId: record.studentId, date },
                update: attendanceUpdate(record, {
                        schoolId,
                        studentId: record.studentId,
                        academicSessionId: section.academicSessionId,
                        sectionId: section._id,
                        date,
                        status: normalizeStatus(record.status, record.checkIn, school),
                        markedBy: req.user._id
                    }),
                upsert: true
            }
        }));
        await writeAttendance(StudentAttendance, operations, { session, ordered: true });
        await createAudit(req, session, "attendance.students.marked", "student_attendance", {
            sectionId: section._id,
            date,
            records: operations.length
        });
        return { date: input.date, sectionId: section._id.toString(), marked: operations.length };
    });
};

export const getStudentAttendanceDay = async (req, input) => {
    const schoolId = assertTenant(req);
    const { section, academicSession } = await assertSectionAccess(req, input.sectionId);
    const date = assertDateInSession(input.date, academicSession);
    const [students, records] = await Promise.all([
        Student.find({
            schoolId,
            sectionId: section._id,
            academicSessionId: section.academicSessionId,
            status: "enrolled"
        }).select("_id admissionNumber firstName lastName").sort({ lastName: 1, firstName: 1, _id: 1 }).lean(),
        StudentAttendance.find({ schoolId, sectionId: section._id, date }).lean()
    ]);
    const attendanceByStudent = new Map(records.map((record) => [String(record.studentId), mapAttendance(record)]));
    return {
        date: input.date,
        sectionId: section._id.toString(),
        items: students.map((student) => ({
            student: {
                id: student._id.toString(),
                admissionNumber: student.admissionNumber,
                firstName: student.firstName,
                lastName: student.lastName
            },
            attendance: attendanceByStudent.get(String(student._id)) ?? null
        }))
    };
};

export const getStudentAttendanceMonth = async (req, input) => {
    const schoolId = assertTenant(req);
    const { section } = await assertSectionAccess(req, input.sectionId);
    const filter = {
        schoolId,
        sectionId: section._id,
        date: monthRange(input.month)
    };
    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const [records, total, statusCounts] = await Promise.all([
        StudentAttendance.find(filter)
            .sort({ date: 1, studentId: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        StudentAttendance.countDocuments(filter),
        StudentAttendance.aggregate([
            { $match: filter },
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ])
    ]);
    const summary = { present: 0, absent: 0, late: 0, leave: 0 };
    for (const item of statusCounts) summary[item._id] = item.count;
    return {
        month: input.month,
        sectionId: section._id.toString(),
        summary,
        items: records.map(mapAttendance),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    };
};

export const markStaffAttendance = async (req, input) => {
    const schoolId = assertTenant(req);
    if (!["school_admin", "principal"].includes(req.user.role)) {
        throw new HttpError(403, "Only school administrators and principals may manage staff attendance");
    }
    return withTransaction(async (session) => {
        const school = await School.findById(schoolId).session(session);
        if (!school) throw new HttpError(404, "School was not found");
        const date = toUtcDate(input.date);
        const userIds = input.records.map(({ userId }) => userId);
        const staff = await User.find({
            _id: { $in: userIds },
            schoolId,
            status: "active",
            role: { $in: ["school_admin", "principal", "teacher"] }
        }).select("_id").session(session).lean();
        if (staff.length !== userIds.length) {
            throw new HttpError(404, "One or more staff members were not found in this school");
        }

        const operations = input.records.map((record) => ({
            updateOne: {
                filter: { schoolId, userId: record.userId, date },
                update: attendanceUpdate(record, {
                        schoolId,
                        userId: record.userId,
                        date,
                        status: normalizeStatus(record.status, record.checkIn, school),
                        markedBy: req.user._id
                    }),
                upsert: true
            }
        }));
        await writeAttendance(StaffAttendance, operations, { session, ordered: true });
        await createAudit(req, session, "attendance.staff.marked", "staff_attendance", {
            date,
            records: operations.length
        });
        return { date: input.date, marked: operations.length };
    });
};

export const getMyStaffAttendanceMonth = async (req, input) => {
    const schoolId = assertTenant(req);
    if (req.user.role === "parent" || req.user.role === "platform_super_admin") {
        throw new HttpError(403, "Staff attendance is not available for this account");
    }
    const records = await StaffAttendance.find({
        schoolId,
        userId: req.user._id,
        date: monthRange(input.month)
    }).sort({ date: 1 }).lean();
    const summary = { present: 0, absent: 0, late: 0, leave: 0 };
    for (const record of records) summary[record.status] += 1;
    return { month: input.month, summary, items: records.map(mapAttendance) };
};

export const getStaffAttendanceMonth = async (req, input) => {
    const schoolId = assertTenant(req);
    if (!["school_admin", "principal"].includes(req.user.role)) {
        throw new HttpError(403, "Only school administrators and principals may review staff attendance");
    }
    const filter = { schoolId, date: monthRange(input.month) };
    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const [records, total, statusCounts] = await Promise.all([
        StaffAttendance.find(filter)
            .populate({ path: "userId", match: { schoolId }, select: "name role jobTitle" })
            .sort({ date: 1, userId: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        StaffAttendance.countDocuments(filter),
        StaffAttendance.aggregate([
            { $match: filter },
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ])
    ]);
    const summary = { present: 0, absent: 0, late: 0, leave: 0 };
    for (const item of statusCounts) summary[item._id] = item.count;
    return {
        month: input.month,
        summary,
        items: records
            .filter((record) => record.userId)
            .map((record) => ({
                ...mapAttendance(record),
                staff: {
                    id: record.userId._id.toString(),
                    name: record.userId.name,
                    role: record.userId.role,
                    jobTitle: record.userId.jobTitle
                }
            })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    };
};
