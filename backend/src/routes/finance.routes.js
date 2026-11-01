import express from "express";
import * as controller from "../controllers/finance.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission, requirePlanFeature, requireTenant } from "../middleware/authorization.middleware.js";
import { paginationSchema, validate } from "../validators/common.validator.js";
import {
    collectionReportQuerySchema,
    feeAssignmentQuerySchema,
    feeCategoryCreateSchema,
    feeCategoryQuerySchema,
    feePaymentSchema,
    feeStructureCreateSchema,
    feeStructureQuerySchema,
    feeVoucherGenerateSchema,
    feeVoucherQuerySchema,
    overdueReportQuerySchema,
    receiptParamsSchema,
    studentFeeAssignmentCreateSchema,
    voucherParamsSchema
} from "../validators/finance.validator.js";

const router = express.Router();
router.use(requireAuth, requireTenant, requirePlanFeature("fees"));

router.get("/categories", requirePermission("finance:read"), validate(feeCategoryQuerySchema, "query"), controller.listCategories);
router.post("/categories", requirePermission("finance:manage"), validate(feeCategoryCreateSchema), controller.createCategory);
router.get("/structures", requirePermission("finance:read"), validate(feeStructureQuerySchema, "query"), controller.listStructures);
router.post("/structures", requirePermission("finance:manage"), validate(feeStructureCreateSchema), controller.createStructure);
router.get("/assignments", requirePermission("finance:read"), validate(feeAssignmentQuerySchema, "query"), controller.listAssignments);
router.post("/assignments", requirePermission("finance:manage"), validate(studentFeeAssignmentCreateSchema), controller.createAssignment);
router.post("/vouchers/generate", requirePermission("finance:manage"), validate(feeVoucherGenerateSchema), controller.generateVouchers);
router.get("/vouchers", requirePermission("finance:read"), validate(feeVoucherQuerySchema, "query"), controller.listVouchers);
router.get("/vouchers/:voucherId", requirePermission("finance:read"), validate(voucherParamsSchema, "params"), controller.getVoucher);
router.post("/vouchers/:voucherId/payments", requirePermission("finance:manage"), validate(voucherParamsSchema, "params"), validate(feePaymentSchema), controller.collectPayment);
router.get("/vouchers/:voucherId/payments", requirePermission("finance:read"), validate(voucherParamsSchema, "params"), validate(paginationSchema, "query"), controller.listPayments);
router.get("/receipts/:receiptNumber", requirePermission("finance:read"), validate(receiptParamsSchema, "params"), controller.getReceipt);
router.get("/reports/overdue", requirePermission("finance:read"), validate(overdueReportQuerySchema, "query"), controller.getOverdueReport);
router.get("/reports/collections", requirePermission("finance:read"), validate(collectionReportQuerySchema, "query"), controller.getCollectionReport);

export default router;
