import * as paymentService from "../services/payment.service.js";
import { sendSuccess } from "../utils/responses.js";

// Public gateway webhook. Authentication is the provider's signature, verified
// inside handleGatewayWebhook; the raw request body is forwarded unchanged.
export const webhook = async (req, res) =>
    sendSuccess(res, 200, await paymentService.handleGatewayWebhook(req.headers, req.body), "Webhook processed");

export const listSchoolPayments = async (req, res) =>
    sendSuccess(res, 200, await paymentService.listSchoolPayments(req, req.query));
