import * as auditService from "../services/audit.service.js";
import { sendSuccess } from "../utils/responses.js";

export const listSchoolEvents = async (req, res) =>
    sendSuccess(res, 200, await auditService.listSchoolAuditEvents(req, req.query));
export const listPlatformEvents = async (req, res) =>
    sendSuccess(res, 200, await auditService.listPlatformAuditEvents(req.query));
