import { z } from "zod";
import { objectIdSchema, paginationSchema } from "./common.validator.js";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Date must be a valid calendar date");
const roleSchema = z.enum(["school_admin", "principal", "teacher", "parent"]);

export const calendarEventCreateSchema = z.object({
    title: z.string().trim().min(2).max(140),
    description: z.string().trim().max(1000).optional(),
    type: z.enum(["holiday", "event", "meeting", "exam"]),
    startsAt: dateSchema,
    endsAt: dateSchema,
    branchId: objectIdSchema.optional(),
    audience: z.array(roleSchema).min(1).max(4).default(["school_admin", "principal", "teacher", "parent"])
}).strict().refine(({ startsAt, endsAt }) => endsAt >= startsAt, {
    message: "Event end date must be on or after its start date",
    path: ["endsAt"]
});

export const calendarQuerySchema = paginationSchema.extend({
    from: dateSchema,
    to: dateSchema,
    type: z.enum(["holiday", "event", "meeting", "exam"]).optional(),
    branchId: objectIdSchema.optional()
}).strict().refine(({ from, to }) => to >= from, {
    message: "Range end must be on or after range start",
    path: ["to"]
});

export const inventoryItemCreateSchema = z.object({
    sku: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/),
    name: z.string().trim().min(2).max(120),
    category: z.string().trim().min(1).max(80),
    unit: z.string().trim().min(1).max(30),
    reorderLevel: z.number().int().min(0).max(10000000).default(0),
    location: z.string().trim().max(120).optional()
}).strict();

export const inventoryQuerySchema = paginationSchema.extend({
    category: z.string().trim().max(80).optional(),
    lowStockOnly: z.enum(["true", "false"]).transform((value) => value === "true").optional()
}).strict();

export const inventoryMovementSchema = z.object({
    type: z.enum(["received", "issued"]),
    quantity: z.number().int().min(1).max(10000000),
    reference: z.string().trim().max(100).optional(),
    note: z.string().trim().max(300).optional()
}).strict();

export const inventoryItemParamsSchema = z.object({ itemId: objectIdSchema }).strict();
export const bookParamsSchema = z.object({ bookId: objectIdSchema }).strict();
export const loanParamsSchema = z.object({ loanId: objectIdSchema }).strict();

export const libraryBookCreateSchema = z.object({
    isbn: z.string().trim().min(10).max(20).optional(),
    title: z.string().trim().min(1).max(180),
    author: z.string().trim().min(1).max(120),
    subject: z.string().trim().max(100).optional(),
    copiesTotal: z.number().int().min(1).max(10000)
}).strict();

export const libraryBookQuerySchema = paginationSchema.extend({
    search: z.string().trim().max(100).optional(),
    availableOnly: z.enum(["true", "false"]).transform((value) => value === "true").optional()
}).strict();

export const libraryLoanCreateSchema = z.object({
    bookId: objectIdSchema,
    studentId: objectIdSchema,
    dueAt: dateSchema,
    note: z.string().trim().max(300).optional()
}).strict();

export const libraryLoanQuerySchema = paginationSchema.extend({
    studentId: objectIdSchema.optional(),
    bookId: objectIdSchema.optional(),
    status: z.enum(["checked_out", "returned"]).optional(),
    overdueOnly: z.enum(["true", "false"]).transform((value) => value === "true").optional()
}).strict();

export const announcementCreateSchema = z.object({
    title: z.string().trim().min(2).max(160),
    body: z.string().trim().min(1).max(5000),
    audience: z.array(roleSchema).min(1).max(4),
    expiresAt: dateSchema.optional()
}).strict();

export const announcementQuerySchema = paginationSchema.strict();
