import express from "express";
import { getCurrentSchool, updateCurrentSchool } from "../controllers/school.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission, requireTenant } from "../middleware/authorization.middleware.js";
import { validate } from "../validators/common.validator.js";
import { updateSchoolSchema } from "../validators/auth.validator.js";

const router = express.Router();

router.use(requireAuth, requireTenant);
router.get("/me", requirePermission("school:read"), getCurrentSchool);
router.patch("/me", requirePermission("school:update"), validate(updateSchoolSchema), updateCurrentSchool);

export default router;
