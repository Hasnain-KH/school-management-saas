import express from "express";
import * as controller from "../controllers/operations.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission, requirePlanFeature, requireTenant } from "../middleware/authorization.middleware.js";
import { validate } from "../validators/common.validator.js";
import {
    announcementCreateSchema,
    announcementQuerySchema,
    calendarEventCreateSchema,
    calendarQuerySchema,
    inventoryItemCreateSchema,
    inventoryItemParamsSchema,
    inventoryMovementSchema,
    inventoryQuerySchema,
    libraryBookCreateSchema,
    libraryBookQuerySchema,
    libraryLoanCreateSchema,
    libraryLoanQuerySchema,
    loanParamsSchema
} from "../validators/operations.validator.js";

const router = express.Router();
router.use(requireAuth, requireTenant);

router.get("/calendar", requirePermission("operations:read"), requirePlanFeature("calendar"), validate(calendarQuerySchema, "query"), controller.listCalendarEvents);
router.post("/calendar", requirePermission("operations:manage"), requirePlanFeature("calendar"), validate(calendarEventCreateSchema), controller.createCalendarEvent);
router.get("/inventory/items", requirePermission("operations:read"), requirePlanFeature("inventory"), validate(inventoryQuerySchema, "query"), controller.listInventoryItems);
router.post("/inventory/items", requirePermission("operations:manage"), requirePlanFeature("inventory"), validate(inventoryItemCreateSchema), controller.createInventoryItem);
router.get("/inventory/reports/low-stock", requirePermission("operations:read"), requirePlanFeature("inventory"), validate(inventoryQuerySchema, "query"), controller.listLowStockItems);
router.post("/inventory/items/:itemId/transactions", requirePermission("operations:manage"), requirePlanFeature("inventory"), validate(inventoryItemParamsSchema, "params"), validate(inventoryMovementSchema), controller.recordInventoryMovement);
router.get("/inventory/items/:itemId/transactions", requirePermission("operations:read"), requirePlanFeature("inventory"), validate(inventoryItemParamsSchema, "params"), validate(inventoryQuerySchema, "query"), controller.listInventoryTransactions);
router.get("/library/books", requirePermission("operations:read"), requirePlanFeature("library"), validate(libraryBookQuerySchema, "query"), controller.listLibraryBooks);
router.post("/library/books", requirePermission("operations:manage"), requirePlanFeature("library"), validate(libraryBookCreateSchema), controller.createLibraryBook);
router.post("/library/loans", requirePermission("operations:manage"), requirePlanFeature("library"), validate(libraryLoanCreateSchema), controller.issueLibraryBook);
router.get("/library/loans", requirePermission("operations:read"), requirePlanFeature("library"), validate(libraryLoanQuerySchema, "query"), controller.listLibraryLoans);
router.post("/library/loans/:loanId/return", requirePermission("operations:manage"), requirePlanFeature("library"), validate(loanParamsSchema, "params"), controller.returnLibraryBook);
router.get("/announcements", requirePermission("notifications:read"), requirePlanFeature("notifications"), validate(announcementQuerySchema, "query"), controller.listAnnouncements);
router.post("/announcements", requirePermission("notifications:manage"), requirePlanFeature("notifications"), validate(announcementCreateSchema), controller.createAnnouncement);

export default router;
