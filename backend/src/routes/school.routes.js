import express from "express";
import { getCurrentSchool, getCurrentSubscription, updateCurrentSchool } from "../controllers/school.controller.js";
import { listSchoolPayments } from "../controllers/payment.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission, requireTenant } from "../middleware/authorization.middleware.js";
import { validate } from "../validators/common.validator.js";
import { updateSchoolSchema } from "../validators/auth.validator.js";
import { schoolPaymentQuerySchema } from "../validators/payment.validator.js";

const router = express.Router();

router.use(requireAuth, requireTenant);
router.get("/me", requirePermission("school:read"), getCurrentSchool);
router.get("/subscription", requirePermission("school:read"), getCurrentSubscription);
router.get("/billing", requirePermission("school:read"), validate(schoolPaymentQuerySchema, "query"), listSchoolPayments);
router.patch("/me", requirePermission("school:update"), validate(updateSchoolSchema), updateCurrentSchool);

export default router;
