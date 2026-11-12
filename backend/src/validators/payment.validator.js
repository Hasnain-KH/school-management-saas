import { z } from "zod";
import { objectIdSchema } from "./common.validator.js";

export const manualPaymentSchema = z.object({
    planId: objectIdSchema.optional(),
    amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    currency: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/)
        .transform((value) => value.toUpperCase()).optional(),
    billingInterval: z.enum(["monthly", "annual"]).optional(),
    periodStart: z.string().datetime().optional(),
    periodEnd: z.string().datetime().optional(),
    notes: z.string().trim().max(500).optional(),
    applySubscription: z.boolean().default(false)
}).strict().refine((value) => Boolean(value.planId) || value.amountMinor !== undefined, {
    message: "Provide a plan or an explicit amount",
    path: ["amountMinor"]
}).refine((value) => Boolean(value.planId) || Boolean(value.currency), {
    message: "Provide a plan or an explicit currency",
    path: ["currency"]
});

export const checkoutSchema = z.object({
    planId: objectIdSchema,
    successUrl: z.string().url().max(500).optional(),
    cancelUrl: z.string().url().max(500).optional()
}).strict();

export const paymentQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    schoolId: objectIdSchema.optional(),
    status: z.enum(["pending", "paid", "failed", "refunded"]).optional()
}).strict();

export const schoolPaymentQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    status: z.enum(["pending", "paid", "failed", "refunded"]).optional()
}).strict();

export const revenueQuerySchema = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "The start date must not be after the end date",
    path: ["to"]
});

export const paymentSchoolParamsSchema = z.object({ schoolId: objectIdSchema }).strict();
