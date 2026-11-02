import express from "express";
import * as controller from "../controllers/fixed-asset.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission, requirePlanFeature, requireTenant } from "../middleware/authorization.middleware.js";
import { paginationSchema, validate } from "../validators/common.validator.js";
import {
    fixedAssetAssignmentSchema,
    fixedAssetCreateSchema,
    fixedAssetDepreciationSchema,
    fixedAssetParamsSchema,
    fixedAssetQuerySchema,
    fixedAssetReleaseSchema
} from "../validators/fixed-asset.validator.js";

const router = express.Router();
router.use(requireAuth, requireTenant, requirePlanFeature("inventory"));
router.get("/", requirePermission("operations:read"), validate(fixedAssetQuerySchema, "query"), controller.list);
router.post("/", requirePermission("operations:manage"), validate(fixedAssetCreateSchema), controller.create);
router.post("/:assetId/assignments", requirePermission("operations:manage"), validate(fixedAssetParamsSchema, "params"), validate(fixedAssetAssignmentSchema), controller.assign);
router.post("/:assetId/release", requirePermission("operations:manage"), validate(fixedAssetParamsSchema, "params"), validate(fixedAssetReleaseSchema), controller.release);
router.post("/:assetId/depreciation", requirePermission("operations:manage"), validate(fixedAssetParamsSchema, "params"), validate(fixedAssetDepreciationSchema), controller.depreciate);
router.get("/:assetId/history", requirePermission("operations:read"), validate(fixedAssetParamsSchema, "params"), validate(paginationSchema, "query"), controller.history);
router.post("/:assetId/dispose", requirePermission("operations:manage"), validate(fixedAssetParamsSchema, "params"), controller.dispose);

export default router;
