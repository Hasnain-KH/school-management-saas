import * as service from "../services/receiving-account.service.js";
import { sendSuccess } from "../utils/responses.js";

export const create = async (req, res) =>
    sendSuccess(res, 201, { account: await service.createReceivingAccount(req, req.body) }, "Receiving account created");
export const list = async (req, res) =>
    sendSuccess(res, 200, await service.listReceivingAccounts(req.query));
export const update = async (req, res) =>
    sendSuccess(res, 200, { account: await service.updateReceivingAccount(req, req.params.accountId, req.body) }, "Receiving account updated");
export const setStatus = async (req, res) =>
    sendSuccess(res, 200, { account: await service.setReceivingAccountStatus(req, req.params.accountId, req.body.isActive) }, "Receiving account status updated");
export const remove = async (req, res) =>
    sendSuccess(res, 200, await service.deleteReceivingAccount(req, req.params.accountId), "Receiving account deleted");
