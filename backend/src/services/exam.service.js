import AcademicClass from "../models/academic-class.model.js";
import AcademicSession from "../models/academic-session.model.js";
import AuditLog from "../models/audit-log.model.js";
import ClassSubject from "../models/class-subject.model.js";
import Exam from "../models/exam.model.js";
import ExamMark from "../models/exam-mark.model.js";
import Student from "../models/student.model.js";
import Subject from "../models/subject.model.js";
import { HttpError } from "../utils/http-error.js";
import { withTransaction } from "../utils/transaction.js";

const assertTenant = (req) => {
    if (!req.user?.schoolId || !req.school
        || String(req.user.schoolId) !== String(req.school._id)) {
        throw new HttpError(403, "A matching school tenant context is required");
    }
    return req.user.schoolId;
};

const writeAudit = async (req, session, action, resourceId, metadata = {}) => {
    const audit = new AuditLog({
        schoolId: assertTenant(req),
        actorUserId: req.user._id,
        action,
        resourceType: "exam",
        resourceId,
        metadata
    });
    await audit.save({ session });
};

const findExam = async (schoolId, examId, session) => {
    let query = Exam.findOne({ _id: examId, schoolId });
    if (session) query = query.session(session);
    const exam = await query;
    if (!exam) throw new HttpError(404, "Exam was not found in this school");
    return exam;
};

const pageData = (page, limit, total) => ({
    page,
    limit,
    total,
    pages: Math.ceil(total / limit)
});

export const createExam = async (req, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const [academicSession, academicClass, classSubjects] = await Promise.all([
            AcademicSession.findOne({ _id: input.academicSessionId, schoolId }).session(session),
            AcademicClass.findOne({ _id: input.classId, schoolId, isActive: true }).session(session),
            ClassSubject.find({
                _id: { $in: input.subjects.map(({ classSubjectId }) => classSubjectId) },
                schoolId,
                academicSessionId: input.academicSessionId,
                classId: input.classId,
                isActive: true
            }).session(session)
        ]);
        if (!academicSession || academicSession.status === "completed" || !academicClass) {
            throw new HttpError(404, "Active academic session and class were not found in this school");
        }
        if (classSubjects.length !== input.subjects.length) {
            throw new HttpError(404, "One or more class subjects were not found in this school");
        }
        const schedules = input.subjects.map((schedule) => {
            const classSubject = classSubjects.find((item) =>
                String(item._id) === String(schedule.classSubjectId)
            );
            const examDate = new Date(`${schedule.examDate}T00:00:00.000Z`);
            if (examDate < academicSession.startDate || examDate > academicSession.endDate) {
                throw new HttpError(400, "Exam dates must fall within the academic session");
            }
            return { ...schedule, examDate, subjectId: classSubject.subjectId };
        });
        const exam = new Exam({
            schoolId,
            academicSessionId: input.academicSessionId,
            classId: input.classId,
            name: input.name,
            gradingScale: [...input.gradingScale].sort((a, b) => a.minPercent - b.minPercent),
            subjects: schedules,
            createdBy: req.user._id
        });
        try {
            await exam.save({ session });
        } catch (error) {
            if (error?.code === 11000) throw new HttpError(409, "An exam with this name already exists for the class/session");
            throw error;
        }
        await writeAudit(req, session, "exam.created", exam._id, {
            classId: exam.classId,
            subjects: schedules.length
        });
        return exam.toObject();
    });
};

export const listExams = async (req, input) => {
    const schoolId = assertTenant(req);
    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const filter = {
        schoolId,
        ...(input.academicSessionId && { academicSessionId: input.academicSessionId }),
        ...(input.classId && { classId: input.classId }),
        ...(input.status && { status: input.status })
    };
    if (input.search) {
        const escaped = input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.name = new RegExp(escaped, "i");
    }
    const [items, total] = await Promise.all([
        Exam.find(filter).sort({ createdAt: -1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
        Exam.countDocuments(filter)
    ]);
    return { items, pagination: pageData(page, limit, total) };
};

const findSchedule = (exam, classSubjectId) =>
    exam.subjects.find((subject) => String(subject.classSubjectId) === String(classSubjectId));

export const enterExamMarks = async (req, examId, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const exam = await findExam(schoolId, examId, session);
        if (exam.status === "published") throw new HttpError(409, "Marks cannot be changed after results are published");
        const schedule = findSchedule(exam, input.classSubjectId);
        if (!schedule) throw new HttpError(404, "Class subject is not scheduled for this exam");

        const classSubject = await ClassSubject.findOne({
            _id: input.classSubjectId,
            schoolId,
            academicSessionId: exam.academicSessionId,
            classId: exam.classId,
            isActive: true
        }).session(session);
        if (!classSubject) throw new HttpError(404, "Class subject was not found in this school");
        if (req.user.role === "teacher" && String(classSubject.teacherId) !== String(req.user._id)) {
            throw new HttpError(403, "Teachers may enter marks only for their assigned subjects");
        }
        if (input.records.some(({ marksObtained }) => marksObtained > schedule.maxMarks)) {
            throw new HttpError(400, "Marks obtained cannot exceed the scheduled maximum marks");
        }

        const studentIds = input.records.map(({ studentId }) => studentId);
        const students = await Student.find({
            _id: { $in: studentIds },
            schoolId,
            status: "enrolled",
            academicSessionId: exam.academicSessionId,
            classId: exam.classId
        }).session(session).select("_id");
        if (students.length !== studentIds.length) {
            throw new HttpError(404, "One or more students are not enrolled in this exam class/session");
        }

        const operations = input.records.map((record) => ({
            updateOne: {
                filter: {
                    schoolId,
                    examId: exam._id,
                    studentId: record.studentId,
                    classSubjectId: input.classSubjectId
                },
                update: {
                    $set: {
                        schoolId,
                        examId: exam._id,
                        studentId: record.studentId,
                        classSubjectId: input.classSubjectId,
                        marksObtained: record.marksObtained,
                        remarks: record.remarks,
                        enteredBy: req.user._id,
                        enteredAt: new Date()
                    }
                },
                upsert: true
            }
        }));
        try {
            await ExamMark.bulkWrite(operations, { session, ordered: true });
        } catch (error) {
            if (error?.code === 11000) throw new HttpError(409, "Marks were concurrently submitted; reload and retry");
            throw error;
        }
        await writeAudit(req, session, "exam.marks.entered", exam._id, {
            classSubjectId: input.classSubjectId,
            records: operations.length
        });
        return { examId: exam._id.toString(), classSubjectId: input.classSubjectId, saved: operations.length };
    });
};

export const publishExamResults = async (req, examId) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const exam = await findExam(schoolId, examId, session);
        if (exam.status === "published") throw new HttpError(409, "Exam results are already published");
        const students = await Student.find({
            schoolId,
            status: "enrolled",
            academicSessionId: exam.academicSessionId,
            classId: exam.classId
        }).select("_id").session(session);
        if (!students.length) throw new HttpError(409, "Cannot publish results without enrolled students");
        const marks = await ExamMark.find({
            schoolId,
            examId: exam._id,
            studentId: { $in: students.map((student) => student._id) }
        }).select("studentId classSubjectId").session(session).lean();
        const expected = students.length * exam.subjects.length;
        if (marks.length !== expected) {
            throw new HttpError(409, "Every enrolled student must have marks for every scheduled subject before publication");
        }
        const updated = await Exam.findOneAndUpdate(
            { _id: exam._id, schoolId, status: "scheduled" },
            { $set: { status: "published", publishedAt: new Date() } },
            { new: true, runValidators: true, session }
        );
        if (!updated) throw new HttpError(409, "Exam status changed; reload and retry");
        await writeAudit(req, session, "exam.results.published", exam._id, {
            students: students.length,
            subjects: exam.subjects.length
        });
        return updated.toObject();
    });
};

const calculateStudentResult = (student, exam, marksBySubject, subjectNames) => {
    const subjects = exam.subjects.map((schedule) => {
        const mark = marksBySubject.get(String(schedule.classSubjectId));
        return {
            classSubjectId: String(schedule.classSubjectId),
            subjectId: String(schedule.subjectId),
            subject: subjectNames.get(String(schedule.subjectId)) ?? "Subject",
            marksObtained: mark?.marksObtained ?? null,
            maxMarks: schedule.maxMarks,
            passingMarks: schedule.passingMarks,
            passed: mark ? mark.marksObtained >= schedule.passingMarks : false,
            remarks: mark?.remarks
        };
    });
    const complete = subjects.every((item) => item.marksObtained !== null);
    const totalObtained = subjects.reduce((total, item) => total + (item.marksObtained ?? 0), 0);
    const totalMaximum = subjects.reduce((total, item) => total + item.maxMarks, 0);
    const percentage = complete ? Math.round((totalObtained / totalMaximum) * 10000) / 100 : null;
    const gradeBand = percentage === null
        ? null
        : exam.gradingScale.find((band, index) =>
            percentage >= band.minPercent
            && (percentage < band.maxPercent || index === exam.gradingScale.length - 1)
        );
    return {
        student: {
            id: student._id.toString(),
            admissionNumber: student.admissionNumber,
            name: `${student.firstName} ${student.lastName}`
        },
        subjects,
        totalObtained,
        totalMaximum,
        percentage,
        grade: gradeBand?.grade ?? null,
        remark: gradeBand?.remark,
        complete,
        passed: complete && subjects.every((item) => item.passed)
    };
};

const getCalculatedResults = async (schoolId, exam) => {
    const [marks, students, subjects] = await Promise.all([
        ExamMark.find({ schoolId, examId: exam._id }).lean(),
        Student.find({
            schoolId,
            _id: { $in: await ExamMark.distinct("studentId", { schoolId, examId: exam._id }) }
        }).select("_id admissionNumber firstName lastName").lean(),
        Subject.find({
            schoolId,
            _id: { $in: exam.subjects.map((schedule) => schedule.subjectId) }
        }).select("_id name").lean()
    ]);
    const marksByStudent = new Map();
    for (const mark of marks) {
        const id = String(mark.studentId);
        if (!marksByStudent.has(id)) marksByStudent.set(id, new Map());
        marksByStudent.get(id).set(String(mark.classSubjectId), mark);
    }
    const subjectNames = new Map(subjects.map((subject) => [String(subject._id), subject.name]));
    return students.map((student) =>
        calculateStudentResult(student, exam, marksByStudent.get(String(student._id)) ?? new Map(), subjectNames)
    );
};

export const getExamResults = async (req, examId, input) => {
    const schoolId = assertTenant(req);
    const exam = await findExam(schoolId, examId);
    if (exam.status !== "published") throw new HttpError(409, "Exam results have not been published");
    const allResults = await getCalculatedResults(schoolId, exam);
    const sortBy = input.sortBy ?? "name";
    const direction = input.sortOrder === "desc" ? -1 : 1;
    allResults.sort((a, b) => {
        const left = sortBy === "percentage" ? a.percentage ?? -1
            : sortBy === "admissionNumber" ? a.student.admissionNumber : a.student.name;
        const right = sortBy === "percentage" ? b.percentage ?? -1
            : sortBy === "admissionNumber" ? b.student.admissionNumber : b.student.name;
        return direction * (typeof left === "number" ? left - right : left.localeCompare(right));
    });
    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    return {
        exam: { id: exam._id.toString(), name: exam.name, classId: exam.classId.toString() },
        items: allResults.slice((page - 1) * limit, page * limit),
        pagination: pageData(page, limit, allResults.length)
    };
};

export const getStudentReportCard = async (req, examId, studentId) => {
    const schoolId = assertTenant(req);
    const exam = await findExam(schoolId, examId);
    if (exam.status !== "published") throw new HttpError(409, "Exam results have not been published");
    const [student, hasMark] = await Promise.all([
        Student.findOne({ _id: studentId, schoolId }).select("_id admissionNumber firstName lastName").lean(),
        ExamMark.exists({ schoolId, examId: exam._id, studentId })
    ]);
    if (!student || !hasMark) throw new HttpError(404, "Report card was not found for this student");
    const results = await getCalculatedResults(schoolId, exam);
    const report = results.find((item) => item.student.id === String(studentId));
    if (!report) throw new HttpError(404, "Report card was not found for this student");
    return { exam: { id: exam._id.toString(), name: exam.name }, ...report };
};

export const getSubjectPerformance = async (req, examId) => {
    const schoolId = assertTenant(req);
    const exam = await findExam(schoolId, examId);
    if (exam.status !== "published") throw new HttpError(409, "Exam results have not been published");
    const marks = await ExamMark.find({ schoolId, examId: exam._id }).lean();
    const subjects = await Subject.find({
        schoolId,
        _id: { $in: exam.subjects.map((schedule) => schedule.subjectId) }
    }).select("_id name").lean();
    const names = new Map(subjects.map((subject) => [String(subject._id), subject.name]));
    return exam.subjects.map((schedule) => {
        const records = marks.filter((mark) => String(mark.classSubjectId) === String(schedule.classSubjectId));
        const total = records.reduce((sum, record) => sum + record.marksObtained, 0);
        return {
            classSubjectId: String(schedule.classSubjectId),
            subjectId: String(schedule.subjectId),
            subject: names.get(String(schedule.subjectId)) ?? "Subject",
            students: records.length,
            maxMarks: schedule.maxMarks,
            averageMarks: records.length ? Math.round((total / records.length) * 100) / 100 : 0,
            highestMarks: records.length ? Math.max(...records.map((record) => record.marksObtained)) : 0,
            passed: records.filter((record) => record.marksObtained >= schedule.passingMarks).length
        };
    });
};
