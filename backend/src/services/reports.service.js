import AcademicSession from "../models/academic-session.model.js";
import AcademicClass from "../models/academic-class.model.js";
import Section from "../models/section.model.js";
import ClassSubject from "../models/class-subject.model.js";
import Exam from "../models/exam.model.js";
import FeePayment from "../models/fee-payment.model.js";
import FeeVoucher from "../models/fee-voucher.model.js";
import StaffAttendance from "../models/staff-attendance.model.js";
import Student from "../models/student.model.js";
import StudentAttendance from "../models/student-attendance.model.js";
import User from "../models/user.model.js";
import { HttpError } from "../utils/http-error.js";

const assertTenant = (req) => {
    if (!req.user?.schoolId || !req.school
        || String(req.user.schoolId) !== String(req.school._id)) {
        throw new HttpError(403, "A matching school tenant context is required");
    }
    return req.user.schoolId;
};

const utcDayStart = (date) => new Date(`${date}T00:00:00.000Z`);
const dayAfter = (date) => {
    const result = utcDayStart(date);
    result.setUTCDate(result.getUTCDate() + 1);
    return result;
};

export const getDashboardSummary = async (req) => {
    const schoolId = assertTenant(req);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [
        studentCounts,
        staffCounts,
        studentAttendance,
        staffAttendance,
        collections,
        outstanding,
        activeSession,
        scheduledExams
    ] = await Promise.all([
        Student.aggregate([
            { $match: { schoolId } },
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]),
        User.aggregate([
            { $match: { schoolId, role: { $in: ["school_admin", "principal", "teacher"] } } },
            { $group: { _id: { role: "$role", status: "$status" }, count: { $sum: 1 } } }
        ]),
        StudentAttendance.aggregate([
            { $match: { schoolId, date: utcDayStart(today) } },
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]),
        StaffAttendance.aggregate([
            { $match: { schoolId, date: utcDayStart(today) } },
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]),
        FeePayment.aggregate([
            { $match: { schoolId, receivedAt: { $gte: monthStart, $lte: now } } },
            { $group: { _id: "$currency", count: { $sum: 1 }, amountMinor: { $sum: "$amountMinor" } } }
        ]),
        FeeVoucher.aggregate([
            { $match: { schoolId, balanceMinor: { $gt: 0 }, dueDate: { $lt: utcDayStart(today) } } },
            { $group: { _id: "$currency", vouchers: { $sum: 1 }, balanceMinor: { $sum: "$balanceMinor" } } }
        ]),
        AcademicSession.findOne({ schoolId, status: "active" }).select("_id name startDate endDate").lean(),
        Exam.countDocuments({ schoolId, status: "scheduled" })
    ]);

    return {
        asOf: now,
        studentsByStatus: studentCounts.map(({ _id, count }) => ({ status: _id, count })),
        staffByRoleAndStatus: staffCounts.map(({ _id, count }) => ({
            role: _id.role,
            status: _id.status,
            count
        })),
        studentAttendanceToday: studentAttendance.map(({ _id, count }) => ({ status: _id, count })),
        staffAttendanceToday: staffAttendance.map(({ _id, count }) => ({ status: _id, count })),
        collectionsThisMonth: collections.map(({ _id, count, amountMinor }) => ({
            currency: _id,
            payments: count,
            amountMinor
        })),
        overdueBalances: outstanding.map(({ _id, vouchers, balanceMinor }) => ({
            currency: _id,
            vouchers,
            balanceMinor
        })),
        activeAcademicSession: activeSession,
        scheduledExams
    };
};

export const getStudentStatistics = async (req) => {
    const schoolId = assertTenant(req);
    const [statusCounts, classCounts] = await Promise.all([
        Student.aggregate([
            { $match: { schoolId } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]),
        Student.aggregate([
            { $match: { schoolId, status: "enrolled" } },
            {
                $group: {
                    _id: { academicSessionId: "$academicSessionId", classId: "$classId" },
                    enrolled: { $sum: 1 }
                }
            }
        ])
    ]);
    return { byStatus: statusCounts, enrolledByClassAndSession: classCounts };
};

export const getStaffStatistics = async (req) => {
    const schoolId = assertTenant(req);
    return User.aggregate([
        {
            $match: {
                schoolId,
                role: { $in: ["school_admin", "principal", "teacher"] }
            }
        },
        {
            $group: {
                _id: { role: "$role", status: "$status" },
                count: { $sum: 1 }
            }
        },
        { $sort: { "_id.role": 1, "_id.status": 1 } }
    ]);
};

export const getAttendanceStatistics = async (req, input) => {
    const schoolId = assertTenant(req);
    const from = utcDayStart(input.from);
    const to = dayAfter(input.to);
    const [students, staff] = await Promise.all([
        StudentAttendance.aggregate([
            { $match: { schoolId, date: { $gte: from, $lt: to } } },
            { $group: { _id: "$status", records: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]),
        StaffAttendance.aggregate([
            { $match: { schoolId, date: { $gte: from, $lt: to } } },
            { $group: { _id: "$status", records: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ])
    ]);
    return { from: input.from, to: input.to, students, staff };
};

export const getAcademicStatistics = async (req) => {
    const schoolId = assertTenant(req);
    const [sessions, classes, sections, classSubjects, exams] = await Promise.all([
        AcademicSession.aggregate([
            { $match: { schoolId } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]),
        AcademicClass.aggregate([
            { $match: { schoolId, isActive: true } },
            { $group: { _id: null, active: { $sum: 1 } } }
        ]),
        Section.aggregate([
            { $match: { schoolId, isActive: true } },
            { $group: { _id: null, active: { $sum: 1 }, enrolled: { $sum: "$enrolledCount" } } }
        ]),
        ClassSubject.aggregate([
            { $match: { schoolId, isActive: true } },
            { $group: { _id: null, assigned: { $sum: 1 } } }
        ]),
        Exam.aggregate([
            { $match: { schoolId } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ])
    ]);
    return {
        sessionsByStatus: sessions.map(({ _id, count }) => ({ status: _id, count })),
        activeClasses: classes[0]?.active ?? 0,
        activeSections: sections[0]?.active ?? 0,
        enrolledSectionSeats: sections[0]?.enrolled ?? 0,
        activeClassSubjectAssignments: classSubjects[0]?.assigned ?? 0,
        examsByStatus: exams.map(({ _id, count }) => ({ status: _id, count }))
    };
};

export const getFinancialStatistics = async (req, input) => {
    const schoolId = assertTenant(req);
    const from = utcDayStart(input.from);
    const to = dayAfter(input.to);
    const [collections, outstanding] = await Promise.all([
        FeePayment.aggregate([
            { $match: { schoolId, receivedAt: { $gte: from, $lt: to } } },
            {
                $group: {
                    _id: { currency: "$currency", method: "$method" },
                    payments: { $sum: 1 },
                    collectedMinor: { $sum: "$amountMinor" }
                }
            },
            { $sort: { "_id.currency": 1, "_id.method": 1 } }
        ]),
        FeeVoucher.aggregate([
            { $match: { schoolId, balanceMinor: { $gt: 0 } } },
            {
                $group: {
                    _id: { currency: "$currency", status: "$status" },
                    vouchers: { $sum: 1 },
                    outstandingMinor: { $sum: "$balanceMinor" }
                }
            },
            { $sort: { "_id.currency": 1, "_id.status": 1 } }
        ])
    ]);
    return {
        from: input.from,
        to: input.to,
        collections: collections.map((row) => ({
            currency: row._id.currency,
            method: row._id.method,
            payments: row.payments,
            collectedMinor: row.collectedMinor
        })),
        outstanding: outstanding.map((row) => ({
            currency: row._id.currency,
            status: row._id.status,
            vouchers: row.vouchers,
            outstandingMinor: row.outstandingMinor
        }))
    };
};
