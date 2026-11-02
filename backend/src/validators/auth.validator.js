import { z } from "zod";
import { emailSchema, passwordSchema } from "./common.validator.js";

const slugSchema = z.string()
    .trim()
    .min(3)
    .max(48)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const schoolRegistrationSchema = z.object({
    schoolName: z.string().trim().min(2).max(120),
    schoolSlug: slugSchema.optional(),
    email: emailSchema,
    phone: z.string().trim().max(30).optional(),
    adminName: z.string().trim().min(2).max(120),
    password: passwordSchema
}).strict();

export const loginSchema = z.object({
    schoolSlug: slugSchema.optional(),
    email: emailSchema,
    password: z.string().min(1).max(72).refine(
        (value) => new TextEncoder().encode(value).length <= 72,
        "Password must not exceed 72 UTF-8 bytes"
    )
}).strict();

export const passwordRecoverySchema = z.object({
    email: emailSchema,
    schoolSlug: slugSchema.optional()
}).strict();
export const emailVerificationRequestSchema = passwordRecoverySchema;

export const accountActionTokenSchema = z.object({
    token: z.string().min(40).max(100),
    password: passwordSchema.optional()
}).strict();

export const passwordResetSchema = accountActionTokenSchema.extend({
    password: passwordSchema
}).strict();

export const emailVerificationSchema = accountActionTokenSchema.omit({ password: true }).strict();

const addressSchema = z.object({
    line1: z.string().trim().max(160).optional(),
    city: z.string().trim().max(100).optional(),
    region: z.string().trim().max(100).optional(),
    country: z.string().trim().max(100).optional(),
    postalCode: z.string().trim().max(20).optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
    message: "At least one address field must be provided"
});

const settingsSchema = z.object({
    attendanceLateGraceMinutes: z.number().int().min(0).max(180).optional(),
    attendanceStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
    message: "At least one setting must be provided"
});

export const updateSchoolSchema = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().max(30).optional(),
    address: addressSchema.optional(),
    settings: settingsSchema.optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
    message: "At least one school field must be provided"
});
