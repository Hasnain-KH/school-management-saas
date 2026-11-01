import * as operationsService from "../services/operations.service.js";
import { sendSuccess } from "../utils/responses.js";

export const createCalendarEvent = async (req, res) =>
    sendSuccess(res, 201, await operationsService.createCalendarEvent(req, req.body), "Calendar event created");
export const listCalendarEvents = async (req, res) =>
    sendSuccess(res, 200, await operationsService.listCalendarEvents(req, req.query));
export const createInventoryItem = async (req, res) =>
    sendSuccess(res, 201, await operationsService.createInventoryItem(req, req.body), "Inventory item created");
export const listInventoryItems = async (req, res) =>
    sendSuccess(res, 200, await operationsService.listInventoryItems(req, req.query));
export const recordInventoryMovement = async (req, res) =>
    sendSuccess(res, 201, await operationsService.recordInventoryMovement(req, req.params.itemId, req.body), "Inventory movement recorded");
export const listInventoryTransactions = async (req, res) =>
    sendSuccess(res, 200, await operationsService.listInventoryTransactions(req, req.params.itemId, req.query));
export const listLowStockItems = async (req, res) =>
    sendSuccess(res, 200, await operationsService.listLowStockItems(req, req.query));
export const createLibraryBook = async (req, res) =>
    sendSuccess(res, 201, await operationsService.createLibraryBook(req, req.body), "Library book added");
export const listLibraryBooks = async (req, res) =>
    sendSuccess(res, 200, await operationsService.listLibraryBooks(req, req.query));
export const issueLibraryBook = async (req, res) =>
    sendSuccess(res, 201, await operationsService.issueLibraryBook(req, req.body), "Book issued");
export const returnLibraryBook = async (req, res) =>
    sendSuccess(res, 200, await operationsService.returnLibraryBook(req, req.params.loanId), "Book returned");
export const listLibraryLoans = async (req, res) =>
    sendSuccess(res, 200, await operationsService.listLibraryLoans(req, req.query));
export const createAnnouncement = async (req, res) =>
    sendSuccess(res, 201, await operationsService.createAnnouncement(req, req.body), "Announcement published");
export const listAnnouncements = async (req, res) =>
    sendSuccess(res, 200, await operationsService.listAnnouncements(req, req.query));
