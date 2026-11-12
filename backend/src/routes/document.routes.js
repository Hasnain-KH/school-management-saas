import express from "express";
import * as controller from "../controllers/document.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission, requireTenant } from "../middleware/authorization.middleware.js";
import { validate } from "../validators/common.validator.js";
import {
    documentCreateSchema,
    documentParamsSchema,
    documentQuerySchema
} from "../validators/document.validator.js";

const router = express.Router();
router.use(requireAuth, requireTenant);

router.get("/", requirePermission("documents:read"), validate(documentQuerySchema, "query"), controller.listDocuments);
router.post("/", requirePermission("documents:manage"), validate(documentCreateSchema), controller.uploadDocument);
router.get("/:id/download", requirePermission("documents:read"), validate(documentParamsSchema, "params"), controller.downloadDocument);
router.delete("/:id", requirePermission("documents:manage"), validate(documentParamsSchema, "params"), controller.deleteDocument);

export default router;
