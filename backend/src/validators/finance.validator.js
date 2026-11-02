import { z } from "zod";
import { objectIdSchema, paginationSchema } from "./common.validator.js";

const codeSchema = z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/);
const periodSchema = z.string().regex(/^\d{4}(?:-(0[1-9]|1[0-2]))?$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Date must be a valid calendar date");

export const feeCategoryCreateSchema = z.object({
    name: z.string().trim().min(1).max(100),
    code: codeSchema,
    description: z.string().trim().max(300).optional()
}).strict();

export const feeCategoryQuerySchema = paginationSchema.extend({
    isActive: z.enum(["true", "false"]).transform((value) => value === "true").optional()
}).strict();

const feeLineSchema = z.object({
    categoryId: objectIdSchema,
    name: z.string().trim().min(1).max(100),
    amountMinor: z.number().int().min(1).max(100000000)
}).strict();

export const feeStructureCreateSchema = z.object({
    academicSessionId: objectIdSchema,
    classId: objectIdSchema,
    name: z.string().trim().min(2).max(120),
    code: codeSchema,
    frequency: z.enum(["monthly", "annual"]),
    dueDay: z.number().int().min(1).max(28).default(10),
    dueMonth: z.number().int().min(1).max(12).optional(),
    currency: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
    lineItems: z.array(feeLineSchema).min(1).max(30)
}).strict().refine(({ frequency, dueMonth }) => frequency !== "annual" || dueMonth !== undefined, {
    message: "Annual fee structures require a due month",
    path: ["dueMonth"]
}).refine(({ lineItems }) =>
    new Set(lineItems.map(({ categoryId }) => categoryId)).size === lineItems.length,
"Each fee category may appear only once in a structure");

export const studentFeeAssignmentCreateSchema = z.object({
    studentId: objectIdSchema,
    feeStructureId: objectIdSchema,
    discountAmountMinor: z.number().int().min(0).max(100000000).default(0),
    discountBasisPoints: z.number().int().min(0).max(10000).default(0),
    scholarshipName: z.string().trim().min(1).max(120).optional(),
    startPeriod: periodSchema,
    endPeriod: periodSchema.optional()
}).strict().refine(({ discountAmountMinor, discountBasisPoints }) =>
    discountAmountMinor === 0 || discountBasisPoints === 0,
"Use either a fixed discount or a percentage discount");

export const feeAssignmentQuerySchema = paginationSchema.extend({
    feeStructureId: objectIdSchema.optional(),
    studentId: objectIdSchema.optional(),
    isActive: z.enum(["true", "false"]).transform((value) => value === "true").optional()
}).strict();

export const feeStructureQuerySchema = paginationSchema.extend({
    academicSessionId: objectIdSchema.optional(),
    classId: objectIdSchema.optional(),
    isActive: z.enum(["true", "false"]).transform((value) => value === "true").optional()
}).strict();

export const feeVoucherGenerateSchema = z.object({
    feeStructureId: objectIdSchema,
    period: periodSchema,
    studentIds: z.array(objectIdSchema).min(1).max(500)
}).strict().refine(({ studentIds }) =>
    !studentIds || new Set(studentIds).size === studentIds.length,
"Student IDs must be unique");

export const feeVoucherQuerySchema = paginationSchema.extend({
    studentId: objectIdSchema.optional(),
    feeStructureId: objectIdSchema.optional(),
    period: periodSchema.optional(),
    status: z.enum(["unpaid", "partial", "paid"]).optional(),
    outstandingOnly: z.enum(["true", "false"]).transform((value) => value === "true").optional()
}).strict();

export const feePaymentSchema = z.object({
    idempotencyKey: z.string().trim().min(12).max(100),
    amountMinor: z.number().int().min(1).max(100000000),
    method: z.enum(["cash", "bank_transfer", "cheque", "other"]),
    reference: z.string().trim().max(100).optional(),
    note: z.string().trim().max(300).optional()
}).strict();

export const voucherParamsSchema = z.object({ voucherId: objectIdSchema }).strict();
export const receiptParamsSchema = z.object({
    receiptNumber: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/)
}).strict();

export const overdueReportQuerySchema = paginationSchema.extend({
    asOf: dateSchema.optional(),
    classId: objectIdSchema.optional()
}).strict();

export const collectionReportQuerySchema = z.object({
    from: dateSchema,
    to: dateSchema,
    classId: objectIdSchema.optional()
}).strict().refine(({ from, to }) => to >= from, {
    message: "Report end date must be on or after start date",
    path: ["to"]
});

export const overdueReminderDispatchSchema = z.object({
    asOf: dateSchema.optional(),
    limit: z.number().int().min(1).max(500).default(250)
}).strict();
