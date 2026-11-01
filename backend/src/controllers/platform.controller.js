import * as platformService from "../services/platform.service.js";
import { toPublicSchool } from "../services/auth.service.js";
import { sendSuccess } from "../utils/responses.js";

export const createPlan = async (req, res) =>
    sendSuccess(res, 201, await platformService.createSubscriptionPlan(req, req.body), "Subscription plan created");
export const listPlans = async (req, res) =>
    sendSuccess(res, 200, await platformService.listSubscriptionPlans(req.query));
export const updatePlan = async (req, res) =>
    sendSuccess(res, 200, await platformService.updateSubscriptionPlan(req, req.params.planId, req.body), "Subscription plan updated");
export const listSchools = async (req, res) =>
    sendSuccess(res, 200, await platformService.listPlatformSchools(req.query));
export const updateSchoolStatus = async (req, res) =>
    sendSuccess(res, 200, { school: toPublicSchool(await platformService.updateSchoolStatus(req, req.params.schoolId, req.body.status)) }, "School status updated");
export const updateSchoolSubscription = async (req, res) =>
    sendSuccess(res, 200, { school: toPublicSchool(await platformService.updateSchoolSubscription(req, req.params.schoolId, req.body)) }, "School subscription updated");
