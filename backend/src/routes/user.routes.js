import express from "express";
import { addUser, editUser, getUsers } from "../controllers/user.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission, requirePlanFeature, requireTenant } from "../middleware/authorization.middleware.js";
import { validate, objectIdSchema } from "../validators/common.validator.js";
import { userCreateSchema, userQuerySchema, userUpdateSchema } from "../validators/user.validator.js";
import { z } from "zod";

const router = express.Router();
const idParams = z.object({ id: objectIdSchema }).strict();
router.use(requireAuth, requireTenant, requirePlanFeature("staff"));
router.get("/", requirePermission("users:manage"), validate(userQuerySchema, "query"), getUsers);
router.post("/", requirePermission("users:manage"), validate(userCreateSchema), addUser);
router.patch("/:id", requirePermission("users:manage"), validate(idParams, "params"), validate(userUpdateSchema), editUser);

export default router;
