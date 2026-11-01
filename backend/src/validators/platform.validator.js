import { z } from "zod";
import { objectIdSchema } from "./common.validator.js";

const planCodeSchema = z.string().trim().toLowerCase().min(2).max(32).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const featureNames = [
    "academics", "students", "staff", "attendance", "fees", "exams", "calendar",
    "inventory", "library", "notifications", "reports"
];
const planFeaturesSchema = z.object(
    Object.fromEntries(featureNames.map((name) => [name, z.boolean().default(false)]))
).strict();
const limitsSchema = z.object({
    students: z.number().int().min(1).nullable(),
    staff: z.number().int().min(1).nullable(),
    branches: z.number().int().min(1).nullable()
}).strict();

const planShape = z.object({
    name: z.string().trim().min(2).max(100),
    code: planCodeSchema,
    description: z.string().trim().max(500).optional(),
    priceMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    currency: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
    billingInterval: z.enum(["monthly", "annual"]),
    trialDurationDays: z.number().int().min(1).max(365).nullable().default(null),
    limits: limitsSchema,
    features: planFeaturesSchema,
    isActive: z.boolean().default(true),
    isDefaultTrial: z.boolean().default(false)
}).strict();

export const planCreateSchema = planShape.refine((plan) => !plan.isDefaultTrial || plan.isActive, {
    message: "The default trial plan must be active",
    path: ["isActive"]
}).refine((plan) => !plan.isDefaultTrial || plan.trialDurationDays !== null, {
    message: "Default trial plans require a trial duration",
    path: ["trialDurationDays"]
});

export const planUpdateSchema = planShape.omit({ code: true }).partial().strict()
    .refine((value) => Object.keys(value).length > 0, {
        message: "At least one plan field must be provided"
    })
    .refine((value) => value.isDefaultTrial !== true || value.isActive !== false, {
        message: "The default trial plan must be active",
        path: ["isActive"]
    })
    .refine((value) => value.isDefaultTrial !== true
        || (value.trialDurationDays !== undefined && value.trialDurationDays !== null), {
        message: "Default trial plans require a trial duration",
        path: ["trialDurationDays"]
    });

export const planParamsSchema = z.object({ planId: objectIdSchema }).strict();
export const platformSchoolParamsSchema = z.object({ schoolId: objectIdSchema }).strict();

const platformListSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(100).optional()
});

export const platformSchoolQuerySchema = platformListSchema.extend({
    status: z.enum(["trial", "active", "suspended", "expired"]).optional()
}).strict();
export const planQuerySchema = platformListSchema.extend({
    includeInactive: z.enum(["true", "false"]).transform((value) => value === "true").default("false")
}).strict();

export const schoolStatusSchema = z.object({
    status: z.enum(["trial", "active", "suspended", "expired"])
}).strict();

export const schoolSubscriptionSchema = z.object({
    planId: objectIdSchema,
    status: z.enum(["trial", "active", "past_due", "canceled"]),
    trialEndsAt: z.string().datetime().optional(),
    currentPeriodEnd: z.string().datetime().optional()
}).strict().refine((value) =>
    value.status !== "trial" || Boolean(value.trialEndsAt), {
    message: "Trial subscriptions require a trial end date",
    path: ["trialEndsAt"]
}).refine((value) =>
    value.status !== "active" || Boolean(value.currentPeriodEnd), {
    message: "Active subscriptions require a billing period end date",
    path: ["currentPeriodEnd"]
});
