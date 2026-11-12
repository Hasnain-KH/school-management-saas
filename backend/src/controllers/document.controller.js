import * as documentService from "../services/document.service.js";
import { sendSuccess } from "../utils/responses.js";

export const uploadDocument = async (req, res) =>
    sendSuccess(res, 201, await documentService.createDocument(req, req.body), "Document uploaded");

export const listDocuments = async (req, res) =>
    sendSuccess(res, 200, await documentService.listDocuments(req, req.query));

export const downloadDocument = async (req, res) =>
    sendSuccess(res, 200, await documentService.getDocumentDownloadUrl(req, req.params.id));

export const deleteDocument = async (req, res) =>
    sendSuccess(res, 200, await documentService.deleteDocument(req, req.params.id), "Document deleted");
