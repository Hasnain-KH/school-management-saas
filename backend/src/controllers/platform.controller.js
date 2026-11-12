import * as platformService from "../services/platform.service.js";
import * as paymentService from "../services/payment.service.js";
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
export const recordPayment = async (req, res) =>
    sendSuccess(res, 201, { payment: await paymentService.recordManualPayment(req, req.params.schoolId, req.body) }, "Payment recorded");
export const createCheckout = async (req, res) =>
    sendSuccess(res, 201, await paymentService.createCheckout(req, req.params.schoolId, req.body), "Checkout session created");
export const listPayments = async (req, res) =>
    sendSuccess(res, 200, await paymentService.listPayments(req.query));
export const revenue = async (req, res) =>
    sendSuccess(res, 200, await paymentService.revenueReport(req.query));
