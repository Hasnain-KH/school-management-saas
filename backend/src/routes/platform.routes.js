import express from "express";
import * as controller from "../controllers/platform.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/authorization.middleware.js";
import { validate } from "../validators/common.validator.js";
import { auditQuerySchema } from "../validators/audit.validator.js";
import { listPlatformEvents } from "../controllers/audit.controller.js";
import * as receivingAccountController from "../controllers/receiving-account.controller.js";
import {
    receivingAccountCreateSchema,
    receivingAccountDeleteQuerySchema,
    receivingAccountListQuerySchema,
    receivingAccountParamsSchema,
    receivingAccountStatusSchema,
    receivingAccountUpdateSchema
} from "../validators/receiving-account.validator.js";
import {
    planCreateSchema,
    planParamsSchema,
    planQuerySchema,
    planUpdateSchema,
    platformSchoolParamsSchema,
    platformSchoolQuerySchema,
    schoolStatusSchema,
    schoolSubscriptionSchema
} from "../validators/platform.validator.js";
import {
    checkoutSchema,
    manualPaymentSchema,
    paymentQuerySchema,
    paymentSchoolParamsSchema,
    revenueQuerySchema
} from "../validators/payment.validator.js";

const router = express.Router();
router.use(requireAuth, requirePermission("platform:manage"));

router.get("/plans", validate(planQuerySchema, "query"), controller.listPlans);
router.get("/audit", validate(auditQuerySchema, "query"), listPlatformEvents);
router.post("/plans", validate(planCreateSchema), controller.createPlan);
router.patch("/plans/:planId", validate(planParamsSchema, "params"), validate(planUpdateSchema), controller.updatePlan);
router.get("/schools", validate(platformSchoolQuerySchema, "query"), controller.listSchools);
router.patch("/schools/:schoolId/status", validate(platformSchoolParamsSchema, "params"), validate(schoolStatusSchema), controller.updateSchoolStatus);
router.patch("/schools/:schoolId/subscription", validate(platformSchoolParamsSchema, "params"), validate(schoolSubscriptionSchema), controller.updateSchoolSubscription);
router.post("/schools/:schoolId/payments", validate(paymentSchoolParamsSchema, "params"), validate(manualPaymentSchema), controller.recordPayment);
router.post("/schools/:schoolId/checkout", validate(paymentSchoolParamsSchema, "params"), validate(checkoutSchema), controller.createCheckout);
router.get("/payments", validate(paymentQuerySchema, "query"), controller.listPayments);
router.get("/reports/revenue", validate(revenueQuerySchema, "query"), controller.revenue);

// Manual receiving accounts. No gateway, no automated verification, no
// subscription activation from these details.
router.get("/receiving-accounts", validate(receivingAccountListQuerySchema, "query"), receivingAccountController.list);
router.post("/receiving-accounts", validate(receivingAccountCreateSchema), receivingAccountController.create);
router.patch(
    "/receiving-accounts/:accountId/status",
    validate(receivingAccountParamsSchema, "params"),
    validate(receivingAccountStatusSchema),
    receivingAccountController.setStatus
);
router.patch(
    "/receiving-accounts/:accountId",
    validate(receivingAccountParamsSchema, "params"),
    validate(receivingAccountUpdateSchema),
    receivingAccountController.update
);
router.delete(
    "/receiving-accounts/:accountId",
    validate(receivingAccountParamsSchema, "params"),
    validate(receivingAccountDeleteQuerySchema, "query"),
    receivingAccountController.remove
);

export default router;
