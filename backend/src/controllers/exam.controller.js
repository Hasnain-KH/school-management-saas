import * as examService from "../services/exam.service.js";
import { sendSuccess } from "../utils/responses.js";

export const createExam = async (req, res) =>
    sendSuccess(res, 201, await examService.createExam(req, req.body), "Exam scheduled");
export const listExams = async (req, res) =>
    sendSuccess(res, 200, await examService.listExams(req, req.query));
export const enterMarks = async (req, res) =>
    sendSuccess(res, 200, await examService.enterExamMarks(req, req.params.examId, req.body), "Marks saved");
export const publishResults = async (req, res) =>
    sendSuccess(res, 200, await examService.publishExamResults(req, req.params.examId), "Results published");
export const getResults = async (req, res) =>
    sendSuccess(res, 200, await examService.getExamResults(req, req.params.examId, req.query));
export const getReportCard = async (req, res) =>
    sendSuccess(res, 200, await examService.getStudentReportCard(req, req.params.examId, req.params.studentId));
export const getSubjectPerformance = async (req, res) =>
    sendSuccess(res, 200, await examService.getSubjectPerformance(req, req.params.examId));
