import * as reportsService from "../services/reports.service.js";
import * as reportDataService from "../services/reports-data.service.js";
import { sendSuccess } from "../utils/responses.js";

export const getDashboard = async (req, res) =>
    sendSuccess(res, 200, await reportsService.getDashboardSummary(req));
export const getStudents = async (req, res) =>
    sendSuccess(res, 200, await reportsService.getStudentStatistics(req));
export const getStaff = async (req, res) =>
    sendSuccess(res, 200, await reportsService.getStaffStatistics(req));
export const getAttendance = async (req, res) =>
    sendSuccess(res, 200, await reportsService.getAttendanceStatistics(req, req.query));
export const getAcademics = async (req, res) =>
    sendSuccess(res, 200, await reportsService.getAcademicStatistics(req));
export const getFinance = async (req, res) =>
    sendSuccess(res, 200, await reportsService.getFinancialStatistics(req, req.query));
export const getStudentRecords = async (req, res) =>
    sendSuccess(res, 200, await reportDataService.getStudentRecords(req, req.query));
export const getAttendanceRecords = async (req, res) =>
    sendSuccess(res, 200, await reportDataService.getAttendanceRecords(req, req.query));
export const getFeeCollectionRecords = async (req, res) =>
    sendSuccess(res, 200, await reportDataService.getFeeCollectionRecords(req, req.query));
export const getFeeDueRecords = async (req, res) =>
    sendSuccess(res, 200, await reportDataService.getFeeDueRecords(req, req.query));
export const getClassSessionRecords = async (req, res) =>
    sendSuccess(res, 200, await reportDataService.getClassSessionRecords(req, req.query));
export const getExamResultRecords = async (req, res) =>
    sendSuccess(res, 200, await reportDataService.getExamResultRecords(req, req.query));
