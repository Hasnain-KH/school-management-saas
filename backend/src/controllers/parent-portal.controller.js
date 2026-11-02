import * as parentPortalService from "../services/parent-portal.service.js";
import { sendSuccess } from "../utils/responses.js";

export const students = async (req, res) =>
    sendSuccess(res, 200, await parentPortalService.listParentStudents(req));
export const attendance = async (req, res) =>
    sendSuccess(res, 200, await parentPortalService.getParentStudentAttendance(req, req.params.studentId, req.query));
export const fees = async (req, res) =>
    sendSuccess(res, 200, await parentPortalService.getParentStudentFees(req, req.params.studentId));
export const results = async (req, res) =>
    sendSuccess(res, 200, await parentPortalService.getParentStudentResults(req, req.params.studentId));
