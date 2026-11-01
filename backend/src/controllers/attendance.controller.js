import * as attendanceService from "../services/attendance.service.js";
import { sendSuccess } from "../utils/responses.js";

export const markStudentAttendance = async (req, res) =>
    sendSuccess(res, 200, await attendanceService.markStudentAttendance(req, req.body), "Student attendance saved");

export const getStudentAttendanceDay = async (req, res) =>
    sendSuccess(res, 200, await attendanceService.getStudentAttendanceDay(req, req.query));

export const getStudentAttendanceMonth = async (req, res) =>
    sendSuccess(res, 200, await attendanceService.getStudentAttendanceMonth(req, req.query));

export const markStaffAttendance = async (req, res) =>
    sendSuccess(res, 200, await attendanceService.markStaffAttendance(req, req.body), "Staff attendance saved");

export const getMyStaffAttendanceMonth = async (req, res) =>
    sendSuccess(res, 200, await attendanceService.getMyStaffAttendanceMonth(req, req.query));

export const getStaffAttendanceMonth = async (req, res) =>
    sendSuccess(res, 200, await attendanceService.getStaffAttendanceMonth(req, req.query));
