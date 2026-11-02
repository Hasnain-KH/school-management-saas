import * as teacherPortalService from "../services/teacher-portal.service.js";
import { sendSuccess } from "../utils/responses.js";

export const examRoster = async (req, res) =>
    sendSuccess(res, 200, await teacherPortalService.getTeacherExamRoster(
        req,
        req.params.examId,
        req.query.classSubjectId
    ));
