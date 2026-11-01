import * as financeService from "../services/finance.service.js";
import { sendSuccess } from "../utils/responses.js";

export const listCategories = async (req, res) =>
    sendSuccess(res, 200, await financeService.listFeeCategories(req, req.query));
export const createCategory = async (req, res) =>
    sendSuccess(res, 201, await financeService.createFeeCategory(req, req.body), "Fee category created");
export const listStructures = async (req, res) =>
    sendSuccess(res, 200, await financeService.listFeeStructures(req, req.query));
export const createStructure = async (req, res) =>
    sendSuccess(res, 201, await financeService.createFeeStructure(req, req.body), "Fee structure created");
export const listAssignments = async (req, res) =>
    sendSuccess(res, 200, await financeService.listStudentFeeAssignments(req, req.query));
export const createAssignment = async (req, res) =>
    sendSuccess(res, 201, await financeService.createStudentFeeAssignment(req, req.body), "Student fee assigned");
export const generateVouchers = async (req, res) =>
    sendSuccess(res, 201, await financeService.generateFeeVouchers(req, req.body), "Fee vouchers generated");
export const listVouchers = async (req, res) =>
    sendSuccess(res, 200, await financeService.listFeeVouchers(req, req.query));
export const getVoucher = async (req, res) =>
    sendSuccess(res, 200, await financeService.getFeeVoucher(req, req.params.voucherId));
export const collectPayment = async (req, res) => {
    const result = await financeService.collectFeePayment(req, req.params.voucherId, req.body);
    return sendSuccess(res, result.replayed ? 200 : 201, result, result.replayed ? "Payment already recorded" : "Payment collected");
};
export const listPayments = async (req, res) =>
    sendSuccess(res, 200, await financeService.listVoucherPayments(req, req.params.voucherId, req.query));
export const getReceipt = async (req, res) =>
    sendSuccess(res, 200, await financeService.getPaymentReceipt(req, req.params.receiptNumber));
export const getOverdueReport = async (req, res) =>
    sendSuccess(res, 200, await financeService.getOverdueFeeReport(req, req.query));
export const getCollectionReport = async (req, res) =>
    sendSuccess(res, 200, await financeService.getFeeCollectionReport(req, req.query));
