import express from "express";
import { getCurrentSchool, getCurrentSubscription, updateCurrentSchool } from "../controllers/school.controller.js";
import { getLogo, removeLogo, uploadLogo } from "../controllers/school-logo.controller.js";
import { listSchoolPayments } from "../controllers/payment.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission, requireRoles, requireTenant } from "../middleware/authorization.middleware.js";
import { validate } from "../validators/common.validator.js";
import { updateSchoolSchema } from "../validators/auth.validator.js";
import { schoolLogoUploadSchema } from "../validators/school-logo.validator.js";
import { schoolPaymentQuerySchema } from "../validators/payment.validator.js";

const router = express.Router();

router.use(requireAuth, requireTenant);
router.get("/me", requirePermission("school:read"), getCurrentSchool);
router.get("/me/logo", requirePermission("school:read"), getLogo);
router.post(
    "/me/logo",
    requirePermission("school:update"),
    requireRoles("school_admin"),
    validate(schoolLogoUploadSchema),
    uploadLogo
);
router.delete(
    "/me/logo",
    requirePermission("school:update"),
    requireRoles("school_admin"),
    removeLogo
);
router.get("/subscription", requirePermission("school:read"), getCurrentSubscription);
router.get("/billing", requirePermission("school:read"), validate(schoolPaymentQuerySchema, "query"), listSchoolPayments);
router.patch("/me", requirePermission("school:update"), validate(updateSchoolSchema), updateCurrentSchool);

export default router;
