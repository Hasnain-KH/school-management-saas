import ClassSubject from "../models/class-subject.model.js";
import Exam from "../models/exam.model.js";
import Student from "../models/student.model.js";
import { HttpError } from "../utils/http-error.js";

export const getTeacherExamRoster = async (req, examId, classSubjectId) => {
    const schoolId = req.school?._id;
    if (req.user?.role !== "teacher" || !schoolId || String(req.user.schoolId) !== String(schoolId)) {
        throw new HttpError(403, "A matching teacher school tenant is required");
    }
    const exam = await Exam.findOne({ _id: examId, schoolId }).select("_id academicSessionId classId status subjects").lean();
    if (!exam) throw new HttpError(404, "Exam was not found in this school");
    if (exam.status === "published") throw new HttpError(409, "Published exam marks are locked");
    const scheduledSubject = exam.subjects.find((subject) =>
        String(subject.classSubjectId) === String(classSubjectId)
    );
    if (!scheduledSubject) throw new HttpError(404, "Subject is not scheduled for this exam");
    const assignment = await ClassSubject.findOne({
        _id: classSubjectId,
        schoolId,
        academicSessionId: exam.academicSessionId,
        classId: exam.classId,
        teacherId: req.user._id,
        isActive: true
    }).select("_id").lean();
    if (!assignment) throw new HttpError(403, "Teachers may only view rosters for their assigned subjects");
    const students = await Student.find({
        schoolId,
        academicSessionId: exam.academicSessionId,
        classId: exam.classId,
        status: "enrolled"
    }).select("_id admissionNumber firstName lastName").sort({ lastName: 1, firstName: 1 }).lean();
    return students.map((student) => ({
        id: String(student._id),
        admissionNumber: student.admissionNumber,
        firstName: student.firstName,
        lastName: student.lastName
    }));
};
