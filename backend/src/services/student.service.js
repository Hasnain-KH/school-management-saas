import AcademicClass from "../models/academic-class.model.js";
import AcademicSession from "../models/academic-session.model.js";
import AuditLog from "../models/audit-log.model.js";
import Guardian from "../models/guardian.model.js";
import School from "../models/school.model.js";
import Section from "../models/section.model.js";
import Student from "../models/student.model.js";
import StudentAcademicHistory from "../models/student-academic-history.model.js";
import StudentLeavingCertificate from "../models/student-leaving-certificate.model.js";
import StudentGuardian from "../models/student-guardian.model.js";
import { HttpError } from "../utils/http-error.js";
import { tenantFilter } from "../middleware/authorization.middleware.js";
import { withTransaction } from "../utils/transaction.js";
import { assertPlanCapacity } from "../utils/plan-limits.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const assertTenant = (req) => {
    if (!req.user?.schoolId || !req.school
        || String(req.user.schoolId) !== String(req.school._id)) {
        throw new HttpError(403, "A matching school tenant context is required");
    }
    return req.user.schoolId;
};

const findStudent = async (schoolId, studentId, session) => {
    let query = Student.findOne({ _id: studentId, schoolId });
    if (session) query = query.session(session);
    const student = await query;
    if (!student) throw new HttpError(404, "Student was not found in this school");
    return student;
};

const findPlacement = async (schoolId, input, session) => {
    const [academicSession, academicClass, section, school] = await Promise.all([
        AcademicSession.findOne({ _id: input.academicSessionId, schoolId }).session(session),
        AcademicClass.findOne({ _id: input.classId, schoolId, isActive: true }).session(session),
        Section.findOne({
            _id: input.sectionId,
            schoolId,
            academicSessionId: input.academicSessionId,
            classId: input.classId,
            branchId: input.branchId,
            isActive: true
        }).session(session),
        School.findById(schoolId).session(session)
    ]);

    if (!academicSession || !academicClass || !section || !school
        || !school.branches.some((branch) => String(branch._id) === String(input.branchId))) {
        throw new HttpError(404, "Academic placement was not found in this school");
    }
    if (academicSession.status === "completed") {
        throw new HttpError(409, "Students cannot be enrolled in a completed academic session");
    }
    return { academicSession, academicClass, section };
};

const reserveSectionSeat = async (schoolId, sectionId, session) => {
    const result = await Section.updateOne(
        {
            _id: sectionId,
            schoolId,
            isActive: true,
            $expr: { $lt: ["$enrolledCount", "$capacity"] }
        },
        { $inc: { enrolledCount: 1 } },
        { session }
    );
    if (result.modifiedCount !== 1) {
        throw new HttpError(409, "Section is full or no longer active");
    }
};

const releaseSectionSeat = async (schoolId, sectionId, session) => {
    const result = await Section.updateOne(
        { _id: sectionId, schoolId, enrolledCount: { $gt: 0 } },
        { $inc: { enrolledCount: -1 } },
        { session }
    );
    if (result.modifiedCount !== 1) {
        throw new HttpError(409, "Section enrollment count is inconsistent");
    }
};

const createAudit = async (req, session, action, resourceType, resourceId, metadata = {}) => {
    const audit = new AuditLog({
        schoolId: assertTenant(req),
        actorUserId: req.user._id,
        action,
        resourceType,
        resourceId,
        metadata
    });
    await audit.save({ session });
};

const createHistory = async (req, session, student, eventType, from, to, effectiveAt, notes) => {
    const history = new StudentAcademicHistory({
        schoolId: assertTenant(req),
        studentId: student._id,
        eventType,
        from,
        to,
        effectiveAt,
        actorUserId: req.user._id,
        notes
    });
    await history.save({ session });
};

const publicStudent = (student) => ({
    id: student._id.toString(),
    schoolId: student.schoolId.toString(),
    admissionNumber: student.admissionNumber,
    firstName: student.firstName,
    lastName: student.lastName,
    dateOfBirth: student.dateOfBirth,
    gender: student.gender,
    admissionDate: student.admissionDate,
    status: student.status,
    branchId: student.branchId.toString(),
    academicSessionId: student.academicSessionId.toString(),
    classId: student.classId.toString(),
    sectionId: student.sectionId.toString(),
    createdAt: student.createdAt,
    updatedAt: student.updatedAt
});

export const listStudents = async (req, input) => {
    const filter = tenantFilter(req, {
        ...(input.status && { status: input.status }),
        ...(input.academicSessionId && { academicSessionId: input.academicSessionId }),
        ...(input.classId && { classId: input.classId }),
        ...(input.sectionId && { sectionId: input.sectionId }),
        ...(input.branchId && { branchId: input.branchId })
    });
    if (input.search) {
        const pattern = new RegExp(escapeRegex(input.search), "i");
        filter.$or = [
            { admissionNumber: pattern },
            { firstName: pattern },
            { lastName: pattern }
        ];
    }

    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const [items, total] = await Promise.all([
        Student.find(filter)
            .sort({ lastName: 1, firstName: 1, _id: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Student.countDocuments(filter)
    ]);
    return {
        items: items.map(publicStudent),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    };
};

export const admitStudent = async (req, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        await assertPlanCapacity(req, session, "students");
        const placementInput = {
            academicSessionId: input.academicSessionId,
            classId: input.classId,
            sectionId: input.sectionId,
            branchId: input.branchId
        };
        const { section } = await findPlacement(schoolId, placementInput, session);
        const guardianIds = [...new Set(input.guardianIds ?? [])];
        const guardians = guardianIds.length
            ? await Guardian.find({
                _id: { $in: guardianIds },
                schoolId,
                isActive: true
            }).session(session)
            : [];
        if (guardians.length !== guardianIds.length) {
            throw new HttpError(404, "One or more guardians were not found in this school");
        }

        await reserveSectionSeat(schoolId, section._id, session);
        const studentInput = { ...input };
        delete studentInput.guardianIds;
        const student = new Student({
            ...studentInput,
            schoolId,
            admissionNumber: input.admissionNumber.toUpperCase(),
            status: "enrolled"
        });
        await student.save({ session });

        if (guardians.length) {
            await StudentGuardian.insertMany(
                guardians.map((guardian, index) => ({
                    schoolId,
                    studentId: student._id,
                    guardianId: guardian._id,
                    isPrimary: index === 0
                })),
                { session }
            );
        }

        const to = {
            academicSessionId: input.academicSessionId,
            classId: input.classId,
            sectionId: input.sectionId,
            branchId: input.branchId
        };
        await createHistory(req, session, student, "admitted", undefined, to, student.admissionDate);
        await createAudit(req, session, "student.admitted", "student", student._id, {
            admissionNumber: student.admissionNumber
        });
        return publicStudent(student);
    });
};

export const getStudent = async (req, studentId) => {
    const schoolId = assertTenant(req);
    const student = await findStudent(schoolId, studentId);
    const guardians = await StudentGuardian.find({ schoolId, studentId })
        .populate({ path: "guardianId", match: { schoolId }, select: "name email phone relationship" })
        .lean();
    return {
        ...publicStudent(student),
        guardians: guardians
            .filter((link) => link.guardianId)
            .map((link) => ({ ...link.guardianId, isPrimary: link.isPrimary }))
    };
};

export const updateStudent = async (req, studentId, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const student = await findStudent(schoolId, studentId, session);
        if (student.status !== "enrolled") {
            throw new HttpError(409, "Only enrolled student profiles can be edited");
        }
        for (const [field, value] of Object.entries(input)) student.set(field, value);
        await student.save({ session });
        await createAudit(req, session, "student.profile.updated", "student", student._id, {
            fields: Object.keys(input)
        });
        return publicStudent(student);
    });
};

export const transitionStudentPlacement = async (req, studentId, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const student = await findStudent(schoolId, studentId, session);
        if (student.status !== "enrolled") {
            throw new HttpError(409, "Only enrolled students can change academic placement");
        }
        const current = {
            academicSessionId: student.academicSessionId,
            classId: student.classId,
            sectionId: student.sectionId,
            branchId: student.branchId
        };
        const target = {
            academicSessionId: input.academicSessionId,
            classId: input.classId,
            sectionId: input.sectionId,
            branchId: input.branchId
        };
        if (Object.entries(target).every(([key, value]) => String(current[key]) === String(value))) {
            throw new HttpError(409, "Student already has this academic placement");
        }

        const [currentSession, targetPlacement] = await Promise.all([
            AcademicSession.findOne({ _id: current.academicSessionId, schoolId }).session(session),
            findPlacement(schoolId, target, session)
        ]);
        if (!currentSession) {
            throw new HttpError(409, "Student's current academic session is missing");
        }
        if (String(current.sectionId) !== String(target.sectionId)) {
            await releaseSectionSeat(schoolId, current.sectionId, session);
            await reserveSectionSeat(schoolId, targetPlacement.section._id, session);
        }
        if (String(current.academicSessionId) !== String(target.academicSessionId)
            && targetPlacement.academicSession.startDate <= currentSession.startDate) {
            throw new HttpError(400, "A promotion must target a later academic session");
        }

        student.academicSessionId = target.academicSessionId;
        student.classId = target.classId;
        student.sectionId = target.sectionId;
        student.branchId = target.branchId;
        await student.save({ session });

        const eventType = String(current.academicSessionId) === String(target.academicSessionId)
            ? "transferred"
            : "promoted";
        await createHistory(req, session, student, eventType, current, target, new Date(), input.notes);
        await createAudit(req, session, `student.${eventType}`, "student", student._id, {
            from: current,
            to: target
        });
        return publicStudent(student);
    });
};

export const changeStudentStatus = async (req, studentId, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const student = await findStudent(schoolId, studentId, session);
        if (student.status !== "enrolled") {
            throw new HttpError(409, "Student already has a terminal enrollment status");
        }
        const from = {
            academicSessionId: student.academicSessionId,
            classId: student.classId,
            sectionId: student.sectionId,
            branchId: student.branchId
        };
        await releaseSectionSeat(schoolId, student.sectionId, session);
        student.status = input.status;
        await student.save({ session });
        await createHistory(
            req, session, student, input.status, from, undefined,
            input.effectiveAt ?? new Date(), input.notes
        );
        await createAudit(req, session, `student.${input.status}`, "student", student._id);
        return publicStudent(student);
    });
};

export const issueLeavingCertificate = async (req, studentId, input = {}) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const student = await findStudent(schoolId, studentId, session);
        if (student.status === "enrolled") {
            throw new HttpError(409, "A leaving certificate can only be issued to a student who has left");
        }

        const existing = await StudentLeavingCertificate.findOne({ schoolId, studentId }).session(session);
        if (existing) {
            throw new HttpError(409, "A leaving certificate has already been issued for this student");
        }

        const [leavingEvent, school] = await Promise.all([
            StudentAcademicHistory.findOne({
                schoolId,
                studentId,
                eventType: student.status
            }).sort({ effectiveAt: -1, _id: -1 }).session(session),
            School.findById(schoolId).session(session)
        ]);
        if (!leavingEvent || !leavingEvent.from || !school) {
            throw new HttpError(409, "The student's leaving record is incomplete");
        }

        const issuedAt = new Date();
        const certificate = new StudentLeavingCertificate({
            schoolId,
            studentId,
            certificateNumber: `LC-${issuedAt.getUTCFullYear()}-${student.admissionNumber}`,
            schoolName: school.name,
            student: {
                admissionNumber: student.admissionNumber,
                firstName: student.firstName,
                lastName: student.lastName,
                dateOfBirth: student.dateOfBirth
            },
            lastPlacement: leavingEvent.from,
            studentStatus: student.status,
            leavingDate: leavingEvent.effectiveAt,
            remarks: input.remarks,
            issuedBy: req.user._id,
            issuedAt
        });

        try {
            await certificate.save({ session });
        } catch (error) {
            if (error?.code === 11000) {
                throw new HttpError(409, "A leaving certificate has already been issued for this student");
            }
            throw error;
        }
        await createAudit(req, session, "student.leaving_certificate.issued", "student", student._id, {
            certificateNumber: certificate.certificateNumber
        });
        return certificate.toObject();
    });
};

export const getLeavingCertificate = async (req, studentId) => {
    const schoolId = assertTenant(req);
    await findStudent(schoolId, studentId);
    const certificate = await StudentLeavingCertificate.findOne({ schoolId, studentId }).lean();
    if (!certificate) throw new HttpError(404, "Leaving certificate was not found");
    return certificate;
};

export const getStudentHistory = async (req, studentId) => {
    const schoolId = assertTenant(req);
    await findStudent(schoolId, studentId);
    return StudentAcademicHistory.find({ schoolId, studentId })
        .sort({ effectiveAt: -1, _id: -1 })
        .lean();
};

export const listGuardians = async (req, input) => {
    assertTenant(req);
    const filter = tenantFilter(req, { isActive: true });
    if (input.search) {
        const pattern = new RegExp(escapeRegex(input.search), "i");
        filter.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }];
    }
    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const [items, total] = await Promise.all([
        Guardian.find(filter).sort({ name: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
        Guardian.countDocuments(filter)
    ]);
    return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

export const createGuardian = async (req, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const guardian = new Guardian({ ...input, schoolId });
        await guardian.save({ session });
        await createAudit(req, session, "guardian.created", "guardian", guardian._id);
        return guardian;
    });
};

export const updateGuardian = async (req, guardianId, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const guardian = await Guardian.findOne({ _id: guardianId, schoolId, isActive: true }).session(session);
        if (!guardian) throw new HttpError(404, "Guardian was not found in this school");
        for (const [field, value] of Object.entries(input)) guardian.set(field, value);
        await guardian.save({ session });
        await createAudit(req, session, "guardian.updated", "guardian", guardian._id, {
            fields: Object.keys(input)
        });
        return guardian;
    });
};

export const archiveGuardian = async (req, guardianId) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const guardian = await Guardian.findOne({ _id: guardianId, schoolId, isActive: true }).session(session);
        if (!guardian) throw new HttpError(404, "Guardian was not found in this school");
        if (await StudentGuardian.exists({ schoolId, guardianId }).session(session)) {
            throw new HttpError(409, "Guardian is linked to students and cannot be archived");
        }
        guardian.isActive = false;
        await guardian.save({ session });
        await createAudit(req, session, "guardian.archived", "guardian", guardian._id);
    });
};

export const linkGuardian = async (req, studentId, guardianId, isPrimary) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const [student, guardian] = await Promise.all([
            Student.findOne({ _id: studentId, schoolId, status: "enrolled" }).session(session),
            Guardian.findOne({ _id: guardianId, schoolId, isActive: true }).session(session)
        ]);
        if (!student) throw new HttpError(404, "Enrolled student was not found in this school");
        if (!guardian) throw new HttpError(404, "Guardian was not found in this school");
        if (isPrimary) {
            await StudentGuardian.updateMany(
                { schoolId, studentId, isPrimary: true },
                { $set: { isPrimary: false } },
                { session }
            );
        }
        const link = await StudentGuardian.findOneAndUpdate(
            { schoolId, studentId, guardianId },
            { $set: { isPrimary } },
            { upsert: true, new: true, runValidators: true, session, setDefaultsOnInsert: true }
        );
        await createAudit(req, session, "student.guardian.linked", "student", studentId, {
            guardianId: guardianId.toString(),
            isPrimary
        });
        return link;
    });
};

export const unlinkGuardian = async (req, studentId, guardianId) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const result = await StudentGuardian.deleteOne({ schoolId, studentId, guardianId }).session(session);
        if (result.deletedCount !== 1) {
            throw new HttpError(404, "Student guardian relationship was not found");
        }
        await createAudit(req, session, "student.guardian.unlinked", "student", studentId, {
            guardianId: guardianId.toString()
        });
    });
};
