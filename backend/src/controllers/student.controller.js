import * as studentService from "../services/student.service.js";
import { sendSuccess } from "../utils/responses.js";

export const getStudents = async (req, res) =>
    sendSuccess(res, 200, await studentService.listStudents(req, req.query));
export const admitStudent = async (req, res) =>
    sendSuccess(res, 201, await studentService.admitStudent(req, req.body), "Student admitted");
export const getStudent = async (req, res) =>
    sendSuccess(res, 200, await studentService.getStudent(req, req.params.id));
export const editStudent = async (req, res) =>
    sendSuccess(res, 200, await studentService.updateStudent(req, req.params.id, req.body), "Student updated");
export const changePlacement = async (req, res) =>
    sendSuccess(
        res,
        200,
        await studentService.transitionStudentPlacement(req, req.params.id, req.body),
        "Student placement updated"
    );
export const changeStatus = async (req, res) =>
    sendSuccess(
        res,
        200,
        await studentService.changeStudentStatus(req, req.params.id, req.body),
        "Student status updated"
    );
export const issueLeavingCertificate = async (req, res) =>
    sendSuccess(
        res,
        201,
        await studentService.issueLeavingCertificate(req, req.params.id, req.body),
        "Leaving certificate issued"
    );
export const getLeavingCertificate = async (req, res) =>
    sendSuccess(res, 200, await studentService.getLeavingCertificate(req, req.params.id));
export const getHistory = async (req, res) =>
    sendSuccess(res, 200, await studentService.getStudentHistory(req, req.params.id));

export const getGuardians = async (req, res) =>
    sendSuccess(res, 200, await studentService.listGuardians(req, req.query));
export const addGuardian = async (req, res) =>
    sendSuccess(res, 201, await studentService.createGuardian(req, req.body), "Guardian created");
export const editGuardian = async (req, res) =>
    sendSuccess(res, 200, await studentService.updateGuardian(req, req.params.guardianId, req.body), "Guardian updated");
export const archiveGuardian = async (req, res) => {
    await studentService.archiveGuardian(req, req.params.guardianId);
    return sendSuccess(res, 200, null, "Guardian archived");
};
export const linkGuardian = async (req, res) =>
    sendSuccess(
        res,
        200,
        await studentService.linkGuardian(
            req,
            req.params.studentId,
            req.params.guardianId,
            req.body.isPrimary
        ),
        "Guardian linked"
    );
export const unlinkGuardian = async (req, res) => {
    await studentService.unlinkGuardian(req, req.params.studentId, req.params.guardianId);
    return sendSuccess(res, 200, null, "Guardian unlinked");
};
