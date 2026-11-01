import * as academicService from "../services/academic.service.js";
import { sendSuccess } from "../utils/responses.js";

const createHandler = (operation, statusCode = 200, message) => async (req, res) =>
    sendSuccess(res, statusCode, await operation(req), message);

export const listBranches = createHandler((req) => academicService.listBranches(req, req.query));
export const createBranch = createHandler((req) => academicService.createBranch(req, req.body), 201);
export const updateBranch = createHandler((req) =>
    academicService.updateBranch(req, req.params.id, req.body));
export const deleteBranch = createHandler(async (req) => {
    await academicService.deleteBranch(req, req.params.id);
    return null;
});

export const listSessions = createHandler((req) =>
    academicService.listAcademicSessions(req, req.query));
export const createSession = createHandler((req) =>
    academicService.createAcademicSession(req, req.body), 201);
export const updateSession = createHandler((req) =>
    academicService.updateAcademicSession(req, req.params.id, req.body));
export const activateSession = createHandler((req) =>
    academicService.activateAcademicSession(req, req.params.id));
export const completeSession = createHandler((req) =>
    academicService.completeAcademicSession(req, req.params.id));

export const listClasses = createHandler((req) => academicService.listClasses(req, req.query));
export const createClass = createHandler((req) => academicService.createClass(req, req.body), 201);
export const updateClass = createHandler((req) =>
    academicService.updateClass(req, req.params.id, req.body));
export const archiveClass = createHandler(async (req) => {
    await academicService.archiveClass(req, req.params.id);
    return null;
});

export const listSections = createHandler((req) => academicService.listSections(req, req.query));
export const createSection = createHandler((req) =>
    academicService.createSection(req, req.body), 201);
export const updateSection = createHandler((req) =>
    academicService.updateSection(req, req.params.id, req.body));
export const archiveSection = createHandler(async (req) => {
    await academicService.archiveSection(req, req.params.id);
    return null;
});

export const listSubjects = createHandler((req) => academicService.listSubjects(req, req.query));
export const createSubject = createHandler((req) =>
    academicService.createSubject(req, req.body), 201);
export const updateSubject = createHandler((req) =>
    academicService.updateSubject(req, req.params.id, req.body));
export const archiveSubject = createHandler(async (req) => {
    await academicService.archiveSubject(req, req.params.id);
    return null;
});

export const listClassSubjects = createHandler((req) =>
    academicService.listClassSubjects(req, req.query));
export const assignSubject = createHandler((req) =>
    academicService.assignSubject(req, req.body), 201);
export const removeClassSubject = createHandler(async (req) => {
    await academicService.removeClassSubject(req, req.params.id);
    return null;
});
export const assignClassTeacher = createHandler((req) =>
    academicService.assignClassTeacher(req, req.params.sectionId, req.body));
export const getClassTeacher = createHandler((req) =>
    academicService.getClassTeacher(req, req.params.sectionId, req.query.academicSessionId));
export const removeClassTeacher = createHandler(async (req) => {
    await academicService.removeClassTeacher(req, req.params.sectionId, req.query.academicSessionId);
    return null;
});

export const listTimetable = createHandler((req) =>
    academicService.listTimetable(req, req.query));
export const createTimetableEntry = createHandler((req) =>
    academicService.createTimetableEntry(req, req.body), 201);
export const deleteTimetableEntry = createHandler(async (req) => {
    await academicService.deleteTimetableEntry(req, req.params.id);
    return null;
});
