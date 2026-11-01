import AcademicClass from "../models/academic-class.model.js";
import AcademicSession from "../models/academic-session.model.js";
import AuditLog from "../models/audit-log.model.js";
import ClassSubject from "../models/class-subject.model.js";
import ClassTeacherAssignment from "../models/class-teacher-assignment.model.js";
import School from "../models/school.model.js";
import Section from "../models/section.model.js";
import Subject from "../models/subject.model.js";
import TimetableEntry from "../models/timetable-entry.model.js";
import User from "../models/user.model.js";
import { HttpError } from "../utils/http-error.js";
import { tenantFilter } from "../middleware/authorization.middleware.js";
import { withTransaction } from "../utils/transaction.js";
import { assertPlanCapacity } from "../utils/plan-limits.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const validSortFields = new Set(["name", "code", "level", "startDate", "endDate", "createdAt", "dayOfWeek"]);

const paginatedList = async (Model, filter, input, searchFields = ["name"]) => {
    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const search = input.search?.trim();
    const query = { ...filter };
    if (search && searchFields.length > 0) {
        const pattern = new RegExp(escapeRegex(search), "i");
        query.$or = searchFields.map((field) => ({ [field]: pattern }));
    }

    const sortBy = validSortFields.has(input.sortBy) ? input.sortBy : "createdAt";
    const sortOrder = input.sortOrder === "desc" ? -1 : 1;
    const [items, total] = await Promise.all([
        Model.find(query)
            .sort({ [sortBy]: sortOrder, _id: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Model.countDocuments(query)
    ]);

    return {
        items,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    };
};

const assertTenant = (req) => {
    if (!req.user?.schoolId || !req.school
        || String(req.user.schoolId) !== String(req.school._id)) {
        throw new HttpError(403, "A matching school tenant context is required");
    }
    return req.user.schoolId;
};

const findOwned = async (Model, schoolId, id, label, session) => {
    let query = Model.findOne({ _id: id, schoolId });
    if (session) query = query.session(session);
    const document = await query;
    if (!document) {
        throw new HttpError(404, `${label} was not found`);
    }
    return document;
};

const writeAcademicAudit = async (req, session, action, resourceType, resourceId, metadata = {}) => {
    const log = new AuditLog({
        schoolId: assertTenant(req),
        actorUserId: req.user._id,
        action,
        resourceType,
        resourceId,
        metadata
    });
    await log.save({ session });
};

const assertBranch = async (schoolId, branchId, session) => {
    const school = await School.findById(schoolId).session(session);
    if (!school || !school.branches.some((branch) => String(branch._id) === String(branchId))) {
        throw new HttpError(404, "Branch was not found in this school");
    }
    return school;
};

const assertSession = async (schoolId, sessionId, dbSession, allowCompleted = false) => {
    const academicSession = await AcademicSession.findOne({
        _id: sessionId,
        schoolId
    }).session(dbSession);
    if (!academicSession) {
        throw new HttpError(404, "Academic session was not found");
    }
    if (!allowCompleted && academicSession.status === "completed") {
        throw new HttpError(409, "Completed academic sessions cannot be modified");
    }
    return academicSession;
};

const assertTeacher = async (schoolId, teacherId, dbSession) => {
    const teacher = await User.findOne({
        _id: teacherId,
        schoolId,
        role: "teacher",
        status: "active"
    }).session(dbSession);
    if (!teacher) {
        throw new HttpError(404, "Active teacher was not found in this school");
    }
    return teacher;
};

const createRecord = async (req, Model, input, resourceType) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const record = new Model({ ...input, schoolId });
        await record.save({ session });
        await writeAcademicAudit(
            req, session, `${resourceType}.created`, resourceType, record._id
        );
        return record;
    });
};

const updateRecord = async (req, Model, id, input, resourceType, allowedFields) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const record = await findOwned(Model, schoolId, id, resourceType, session);
        for (const field of allowedFields) {
            if (input[field] !== undefined) {
                record.set(field, input[field]);
            }
        }
        await record.save({ session });
        await writeAcademicAudit(
            req, session, `${resourceType}.updated`, resourceType, record._id,
            { fields: Object.keys(input) }
        );
        return record;
    });
};

export const listBranches = (req, input) => {
    const schoolId = assertTenant(req);
    return School.findById(schoolId).then((school) => {
        if (!school) {
            throw new HttpError(404, "School was not found");
        }
        const search = input.search?.toLowerCase();
        let branches = school.branches.map((branch) => branch.toObject());
        if (search) {
            branches = branches.filter((branch) =>
                branch.name.toLowerCase().includes(search) || branch.code.toLowerCase().includes(search)
            );
        }
        const page = input.page ?? 1;
        const limit = input.limit ?? 25;
        const sortBy = input.sortBy === "code" ? "code" : "name";
        const direction = input.sortOrder === "desc" ? -1 : 1;
        branches.sort((a, b) => direction * a[sortBy].localeCompare(b[sortBy]));
        return {
            items: branches.slice((page - 1) * limit, page * limit),
            pagination: { page, limit, total: branches.length, pages: Math.ceil(branches.length / limit) }
        };
    });
};

export const createBranch = async (req, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        await assertPlanCapacity(req, session, "branches");
        const school = await School.findById(schoolId).session(session);
        if (!school) {
            throw new HttpError(404, "School was not found");
        }
        const code = input.code.toUpperCase();
        if (school.branches.some((branch) => branch.code === code)) {
            throw new HttpError(409, "A branch with this code already exists");
        }
        const branch = school.branches.create({ ...input, code, isMain: false });
        school.branches.push(branch);
        await school.save({ session });
        await writeAcademicAudit(req, session, "branch.created", "branch", branch._id);
        return branch;
    });
};

export const updateBranch = async (req, branchId, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const school = await School.findById(schoolId).session(session);
        const branch = school?.branches.id(branchId);
        if (!branch) {
            throw new HttpError(404, "Branch was not found");
        }
        if (input.code && school.branches.some((candidate) =>
            String(candidate._id) !== String(branchId) && candidate.code === input.code.toUpperCase()
        )) {
            throw new HttpError(409, "A branch with this code already exists");
        }
        if (input.name !== undefined) branch.name = input.name;
        if (input.code !== undefined) branch.code = input.code.toUpperCase();
        await school.save({ session });
        await writeAcademicAudit(req, session, "branch.updated", "branch", branch._id, {
            fields: Object.keys(input)
        });
        return branch;
    });
};

export const deleteBranch = async (req, branchId) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const school = await School.findById(schoolId).session(session);
        const branch = school?.branches.id(branchId);
        if (!branch) {
            throw new HttpError(404, "Branch was not found");
        }
        if (branch.isMain) {
            throw new HttpError(409, "The main branch cannot be deleted");
        }
        const linkedSections = await Section.exists({ schoolId, branchId }).session(session);
        if (linkedSections) {
            throw new HttpError(409, "Branch has sections; reassign them before deleting it");
        }
        school.branches.pull(branchId);
        await school.save({ session });
        await writeAcademicAudit(req, session, "branch.deleted", "branch", branchId);
    });
};

export const listAcademicSessions = (req, input) =>
    paginatedList(
        AcademicSession,
        tenantFilter(req, input.status ? { status: input.status } : {}),
        input
    );

export const createAcademicSession = async (req, input) =>
    createRecord(req, AcademicSession, { ...input, status: "upcoming" }, "academic_session");

export const updateAcademicSession = async (req, id, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const record = await findOwned(AcademicSession, schoolId, id, "Academic session", session);
        if (record.status === "completed") {
            throw new HttpError(409, "Completed academic sessions cannot be modified");
        }
        for (const [field, value] of Object.entries(input)) record.set(field, value);
        await record.save({ session });
        await writeAcademicAudit(req, session, "academic_session.updated", "academic_session", record._id, {
            fields: Object.keys(input)
        });
        return record;
    });
};

export const activateAcademicSession = async (req, id) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const target = await findOwned(AcademicSession, schoolId, id, "Academic session", session);
        if (target.status === "completed") {
            throw new HttpError(409, "A completed academic session cannot be reactivated");
        }
        const current = await AcademicSession.findOne({ schoolId, status: "active" }).session(session);
        if (current && String(current._id) !== String(target._id)) {
            current.status = "completed";
            await current.save({ session });
        }
        target.status = "active";
        await target.save({ session });
        await writeAcademicAudit(req, session, "academic_session.activated", "academic_session", target._id);
        return target;
    });
};

export const completeAcademicSession = async (req, id) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const target = await findOwned(AcademicSession, schoolId, id, "Academic session", session);
        if (target.status !== "active") {
            throw new HttpError(409, "Only the active academic session can be completed");
        }
        target.status = "completed";
        await target.save({ session });
        await writeAcademicAudit(req, session, "academic_session.completed", "academic_session", target._id);
        return target;
    });
};

export const listClasses = (req, input) =>
    paginatedList(
        AcademicClass,
        tenantFilter(req, input.isActive === undefined ? {} : { isActive: input.isActive }),
        input
    );

export const createClass = (req, input) => createRecord(req, AcademicClass, input, "academic_class");
export const updateClass = (req, id, input) =>
    updateRecord(req, AcademicClass, id, input, "academic_class", ["name", "code", "level", "isActive"]);

export const archiveClass = async (req, id) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const record = await findOwned(AcademicClass, schoolId, id, "Class", session);
        if (await Section.exists({ schoolId, classId: id }).session(session)) {
            throw new HttpError(409, "Class has sections and cannot be archived");
        }
        record.isActive = false;
        await record.save({ session });
        await writeAcademicAudit(req, session, "academic_class.archived", "academic_class", record._id);
    });
};

export const listSections = (req, input) =>
    paginatedList(
        Section,
        tenantFilter(req, {
            ...(input.academicSessionId && { academicSessionId: input.academicSessionId }),
            ...(input.classId && { classId: input.classId }),
            ...(input.branchId && { branchId: input.branchId }),
            ...(input.isActive === undefined ? {} : { isActive: input.isActive })
        }),
        input
    );

export const createSection = async (req, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        await assertSession(schoolId, input.academicSessionId, session);
        const academicClass = await AcademicClass.findOne({
            _id: input.classId, schoolId, isActive: true
        }).session(session);
        if (!academicClass) {
            throw new HttpError(404, "Active class was not found in this school");
        }
        await assertBranch(schoolId, input.branchId, session);
        const record = new Section({ ...input, schoolId });
        await record.save({ session });
        await writeAcademicAudit(req, session, "section.created", "section", record._id);
        return record;
    });
};

export const updateSection = async (req, id, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const section = await findOwned(Section, schoolId, id, "Section", session);
        await assertSession(schoolId, section.academicSessionId, session);
        if (input.branchId) await assertBranch(schoolId, input.branchId, session);
        for (const [field, value] of Object.entries(input)) section.set(field, value);
        await section.save({ session });
        await writeAcademicAudit(req, session, "section.updated", "section", section._id, {
            fields: Object.keys(input)
        });
        return section;
    });
};

export const archiveSection = async (req, id) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const section = await findOwned(Section, schoolId, id, "Section", session);
        const [timetable, teacher] = await Promise.all([
            TimetableEntry.exists({ schoolId, sectionId: id }).session(session),
            ClassTeacherAssignment.exists({ schoolId, sectionId: id }).session(session)
        ]);
        if (timetable || teacher) {
            throw new HttpError(409, "Section has academic assignments and cannot be archived");
        }
        section.isActive = false;
        await section.save({ session });
        await writeAcademicAudit(req, session, "section.archived", "section", section._id);
    });
};

export const listSubjects = (req, input) =>
    paginatedList(
        Subject,
        tenantFilter(req, input.isActive === undefined ? {} : { isActive: input.isActive }),
        input
    );
export const createSubject = (req, input) => createRecord(req, Subject, input, "subject");
export const updateSubject = (req, id, input) =>
    updateRecord(req, Subject, id, input, "subject", ["name", "code", "category", "isActive"]);

export const archiveSubject = async (req, id) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const subject = await findOwned(Subject, schoolId, id, "Subject", session);
        if (await ClassSubject.exists({ schoolId, subjectId: id }).session(session)) {
            throw new HttpError(409, "Subject has class assignments and cannot be archived");
        }
        subject.isActive = false;
        await subject.save({ session });
        await writeAcademicAudit(req, session, "subject.archived", "subject", subject._id);
    });
};

const classSubjectFilter = (req, input) => tenantFilter(req, {
    ...(input.academicSessionId && { academicSessionId: input.academicSessionId }),
    ...(input.classId && { classId: input.classId }),
    ...(input.isActive === undefined ? {} : { isActive: input.isActive })
});

export const listClassSubjects = async (req, input) => {
    const filter = classSubjectFilter(req, input);
    if (input.search) {
        const subjectIds = await Subject.find({
            schoolId: assertTenant(req),
            name: new RegExp(escapeRegex(input.search), "i")
        }).distinct("_id");
        filter.subjectId = { $in: subjectIds };
    }
    return paginatedList(ClassSubject, filter, { ...input, search: undefined });
};

export const assignSubject = async (req, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        await assertSession(schoolId, input.academicSessionId, session);
        const [academicClass, subject] = await Promise.all([
            AcademicClass.findOne({ _id: input.classId, schoolId, isActive: true }).session(session),
            Subject.findOne({ _id: input.subjectId, schoolId, isActive: true }).session(session)
        ]);
        if (!academicClass || !subject) {
            throw new HttpError(404, "Active class or subject was not found in this school");
        }
        if (input.teacherId) await assertTeacher(schoolId, input.teacherId, session);
        const assignment = await ClassSubject.findOneAndUpdate(
            {
                schoolId,
                academicSessionId: input.academicSessionId,
                classId: input.classId,
                subjectId: input.subjectId
            },
            {
                $set: {
                    periodsPerWeek: input.periodsPerWeek ?? 1,
                    isActive: true,
                    ...(input.teacherId && { teacherId: input.teacherId })
                },
                $setOnInsert: { schoolId }
            },
            { new: true, upsert: true, runValidators: true, session, setDefaultsOnInsert: true }
        );
        await writeAcademicAudit(req, session, "class_subject.assigned", "class_subject", assignment._id);
        return assignment;
    });
};

export const removeClassSubject = async (req, id) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const assignment = await findOwned(ClassSubject, schoolId, id, "Class subject assignment", session);
        if (await TimetableEntry.exists({ schoolId, classSubjectId: id }).session(session)) {
            throw new HttpError(409, "Subject assignment is used by a timetable");
        }
        assignment.isActive = false;
        await assignment.save({ session });
        await writeAcademicAudit(req, session, "class_subject.unassigned", "class_subject", assignment._id);
    });
};

export const assignClassTeacher = async (req, sectionId, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const [section, academicSession] = await Promise.all([
            Section.findOne({
                _id: sectionId,
                schoolId,
                academicSessionId: input.academicSessionId,
                isActive: true
            }).session(session),
            assertSession(schoolId, input.academicSessionId, session)
        ]);
        if (!section) {
            throw new HttpError(404, "Active section was not found in this academic session");
        }
        await assertTeacher(schoolId, input.teacherId, session);
        const assignment = await ClassTeacherAssignment.findOneAndUpdate(
            { schoolId, academicSessionId: academicSession._id, sectionId },
            { $set: { teacherId: input.teacherId, assignedBy: req.user._id } },
            { new: true, upsert: true, runValidators: true, session, setDefaultsOnInsert: true }
        );
        await writeAcademicAudit(req, session, "class_teacher.assigned", "section", sectionId, {
            teacherId: input.teacherId
        });
        return assignment;
    });
};

export const getClassTeacher = async (req, sectionId, academicSessionId) => {
    const schoolId = assertTenant(req);
    const section = await Section.findOne({
        _id: sectionId,
        schoolId,
        academicSessionId
    }).lean();
    if (!section) {
        throw new HttpError(404, "Section was not found in this school and academic session");
    }
    const assignment = await ClassTeacherAssignment.findOne({
        schoolId,
        academicSessionId,
        sectionId
    }).lean();
    if (!assignment) {
        throw new HttpError(404, "Class teacher assignment was not found");
    }
    return assignment;
};

export const removeClassTeacher = async (req, sectionId, academicSessionId) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const section = await Section.findOne({
            _id: sectionId,
            schoolId,
            academicSessionId
        }).session(session);
        if (!section) {
            throw new HttpError(404, "Section was not found in this school and academic session");
        }
        const result = await ClassTeacherAssignment.deleteOne({
            schoolId,
            academicSessionId,
            sectionId
        }).session(session);
        if (result.deletedCount !== 1) {
            throw new HttpError(404, "Class teacher assignment was not found");
        }
        await writeAcademicAudit(req, session, "class_teacher.unassigned", "section", sectionId);
    });
};

const validateTimetableRefs = async (schoolId, input, session) => {
    const [section, classSubject] = await Promise.all([
        Section.findOne({
            _id: input.sectionId,
            schoolId,
            academicSessionId: input.academicSessionId,
            isActive: true
        }).session(session),
        ClassSubject.findOne({
            _id: input.classSubjectId,
            schoolId,
            academicSessionId: input.academicSessionId,
            isActive: true
        }).session(session)
    ]);
    if (!section || !classSubject) {
        throw new HttpError(404, "Section or class-subject assignment was not found");
    }
    if (String(section.classId) !== String(classSubject.classId)) {
        throw new HttpError(400, "Subject assignment does not belong to this section's class");
    }
    if (!classSubject.teacherId) {
        throw new HttpError(409, "Assign a teacher to the subject before scheduling it");
    }
    await assertSession(schoolId, input.academicSessionId, session);
    return { section, classSubject };
};

export const createTimetableEntry = async (req, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const { classSubject } = await validateTimetableRefs(schoolId, input, session);
        const entry = new TimetableEntry({
            ...input,
            schoolId,
            teacherId: classSubject.teacherId
        });
        await entry.save({ session });
        await writeAcademicAudit(req, session, "timetable_entry.created", "timetable_entry", entry._id);
        return entry;
    });
};

export const listTimetable = (req, input) =>
    paginatedList(
        TimetableEntry,
        tenantFilter(req, {
            academicSessionId: input.academicSessionId,
            ...(input.sectionId && { sectionId: input.sectionId }),
            ...(input.dayOfWeek && { dayOfWeek: input.dayOfWeek })
        }),
        input,
        ["room"]
    );

export const deleteTimetableEntry = async (req, id) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const entry = await findOwned(TimetableEntry, schoolId, id, "Timetable entry", session);
        await entry.deleteOne({ session });
        await writeAcademicAudit(req, session, "timetable_entry.deleted", "timetable_entry", entry._id);
    });
};
