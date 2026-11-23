import * as studentMediaService from "../services/student-media.service.js";
import { sendSuccess } from "../utils/responses.js";

export const createUpload = async (req, res) =>
  sendSuccess(res, 201, await studentMediaService.createStudentMediaUpload(req, req.body), "Media submitted for review");

export const resubmit = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.resubmitMedia(req, req.params.id, req.body), "Media resubmitted for review");

export const getTeacherUploadCapabilities = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.getTeacherUploadCapabilities(req));

export const authorizeDirectUpload = async (req, res) =>
  sendSuccess(res, 201, await studentMediaService.authorizeTeacherDirectUpload(req, req.body), "Direct upload authorized");

export const finalizeDirectUpload = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.finalizeTeacherDirectUpload(req, req.body), "Direct upload finalized");

export const authorizeDirectResubmit = async (req, res) =>
  sendSuccess(res, 201, await studentMediaService.authorizeTeacherDirectResubmit(req, req.params.id, req.body), "Direct resubmit authorized");

export const finalizeDirectResubmit = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.finalizeTeacherDirectResubmit(req, req.params.id, req.body), "Direct resubmit finalized");

export const listTeacherMedia = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.listTeacherMedia(req, req.query));

export const listTeacherStudents = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.listTeacherAuthorizedStudents(req));

export const listAdminQueue = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.getAdminMediaQueue(req, req.query));

export const getAdminDetail = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.getAdminMediaDetail(req, req.params.id));

export const approve = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.approveMedia(req, req.params.id, req.body), "Media approved");

export const requestChanges = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.requestMediaChanges(req, req.params.id, req.body), "Changes requested");

export const reject = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.rejectMedia(req, req.params.id, req.body), "Media rejected");

export const publish = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.publishMedia(req, req.params.id, req.body), "Media published");

export const archive = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.archiveMedia(req, req.params.id, req.body), "Media archived");

export const remove = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.removeMedia(req, req.params.id, req.body), "Media removed");

export const listParentMedia = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.listParentMedia(req, req.query));

export const getParentDetail = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.getParentMediaDetail(req, req.params.id));

export const getAccessUrl = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.getSecureMediaAccess(req, req.params.id));

export const listConsents = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.listStudentMediaConsents(req, req.query));

export const createConsent = async (req, res) =>
  sendSuccess(res, 201, await studentMediaService.createStudentMediaConsent(req, req.body), "Consent record created");

export const updateConsent = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.updateStudentMediaConsent(req, req.params.id, req.body), "Consent record updated");

export const withdrawConsent = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.withdrawStudentMediaConsent(req, req.params.id, req.body), "Consent withdrawn");

export const usageSummary = async (req, res) =>
  sendSuccess(res, 200, await studentMediaService.getStudentMediaUsageSummary(req));
