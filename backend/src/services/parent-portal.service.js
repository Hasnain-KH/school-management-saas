import Exam from "../models/exam.model.js";
import ExamMark from "../models/exam-mark.model.js";
import FeePayment from "../models/fee-payment.model.js";
import FeeVoucher from "../models/fee-voucher.model.js";
import Guardian from "../models/guardian.model.js";
import Student from "../models/student.model.js";
import StudentAttendance from "../models/student-attendance.model.js";
import StudentGuardian from "../models/student-guardian.model.js";
import { HttpError } from "../utils/http-error.js";

const tenantId = (req) => {
    if (req.user?.role !== "parent" || !req.user?.schoolId || !req.school
        || String(req.school._id) !== String(req.user.schoolId)) {
        throw new HttpError(403, "A matching parent school tenant is required");
    }
    return req.user.schoolId;
};

const linkedStudentIds = async (req, schoolId) => {
    const guardians = await Guardian.find({
        schoolId,
        email: req.user.email.toLowerCase(),
        isActive: true
    }).select("_id").lean();
    if (!guardians.length) return [];
    const links = await StudentGuardian.find({
        schoolId,
        guardianId: { $in: guardians.map(({ _id }) => _id) }
    }).select("studentId").lean();
    return [...new Set(links.map(({ studentId }) => String(studentId)))];
};

const assertLinkedStudent = async (req, studentId, schoolId) => {
    const linkedIds = await linkedStudentIds(req, schoolId);
    if (!linkedIds.includes(String(studentId))) {
        throw new HttpError(404, "Student was not found in this parent's linked records");
    }
    const student = await Student.findOne({ _id: studentId, schoolId }).lean();
    if (!student) throw new HttpError(404, "Student was not found in this parent's linked records");
    return student;
};

export const listParentStudents = async (req) => {
    const schoolId = tenantId(req);
    const studentIds = await linkedStudentIds(req, schoolId);
    if (!studentIds.length) return [];
    const students = await Student.find({ _id: { $in: studentIds }, schoolId })
        .sort({ lastName: 1, firstName: 1, _id: 1 })
        .select("_id admissionNumber firstName lastName status classId sectionId")
        .lean();
    return students.map((student) => ({
        id: String(student._id),
        admissionNumber: student.admissionNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        status: student.status,
        classId: String(student.classId),
        sectionId: String(student.sectionId)
    }));
};

export const getParentStudentAttendance = async (req, studentId, input = {}) => {
    const schoolId = tenantId(req);
    await assertLinkedStudent(req, studentId, schoolId);
    const now = new Date();
    const from = input.from ? new Date(`${input.from}T00:00:00.000Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = input.to ? new Date(`${input.to}T23:59:59.999Z`) : now;
    if (to < from) throw new HttpError(400, "End date must be on or after start date");
    return StudentAttendance.find({
        schoolId,
        studentId,
        date: { $gte: from, $lte: to }
    }).select("date status checkIn checkOut note").sort({ date: -1 }).limit(100).lean();
};

export const getParentStudentFees = async (req, studentId) => {
    const schoolId = tenantId(req);
    await assertLinkedStudent(req, studentId, schoolId);
    const vouchers = await FeeVoucher.find({ schoolId, studentId })
        .select("period dueDate currency amountDueMinor paidAmountMinor balanceMinor status")
        .sort({ dueDate: -1 })
        .limit(100)
        .lean();
    const payments = await FeePayment.find({ schoolId, studentId })
        .select("receiptNumber amountMinor currency method receivedAt")
        .sort({ receivedAt: -1 })
        .limit(100)
        .lean();
    return { vouchers, payments };
};

export const getParentStudentResults = async (req, studentId) => {
    const schoolId = tenantId(req);
    const student = await assertLinkedStudent(req, studentId, schoolId);
    const exams = await Exam.find({
        schoolId,
        classId: student.classId,
        status: "published"
    }).select("_id name academicSessionId publishedAt").sort({ publishedAt: -1 }).limit(50).lean();
    if (!exams.length) return [];
    return ExamMark.find({
        schoolId,
        studentId,
        examId: { $in: exams.map(({ _id }) => _id) }
    }).select("examId classSubjectId marksObtained enteredAt").sort({ enteredAt: -1 }).limit(250).lean();
};
