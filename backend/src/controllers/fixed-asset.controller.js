import * as assetService from "../services/fixed-asset.service.js";
import { sendSuccess } from "../utils/responses.js";

export const create = async (req, res) =>
    sendSuccess(res, 201, await assetService.createFixedAsset(req, req.body), "Fixed asset recorded");
export const list = async (req, res) =>
    sendSuccess(res, 200, await assetService.listFixedAssets(req, req.query));
export const assign = async (req, res) =>
    sendSuccess(res, 201, await assetService.assignFixedAsset(req, req.params.assetId, req.body), "Asset assigned");
export const release = async (req, res) =>
    sendSuccess(res, 201, await assetService.releaseFixedAsset(req, req.params.assetId, req.body), "Asset released");
export const depreciate = async (req, res) =>
    sendSuccess(res, 201, await assetService.recordAssetDepreciation(req, req.params.assetId, req.body), "Depreciation recorded");
export const history = async (req, res) =>
    sendSuccess(res, 200, await assetService.getAssetHistory(req, req.params.assetId, req.query));
export const dispose = async (req, res) =>
    sendSuccess(res, 200, await assetService.disposeFixedAsset(req, req.params.assetId), "Asset disposed");
