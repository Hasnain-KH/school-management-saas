import { z } from "zod";
import { objectIdSchema } from "./common.validator.js";

// These details are displayed to school owners. Login credentials are never
// accepted, even in free text, so a mistaken paste cannot become public.
const CREDENTIAL_MARKERS = /\b(password|passwd|pin|otp|cvv|secret)\b/i;
const noCredentials = (value) => {
    for (const entry of Object.values(value)) {
        if (typeof entry === "string" && CREDENTIAL_MARKERS.test(entry)) return false;
    }
    return true;
};
const credentialMessage = "Do not store passwords, PINs, OTPs, or other login credentials";

const accountTypeSchema = z.enum(["bank_account", "jazzcash", "easypaisa", "other"]);
const accountNumberSchema = z.string().trim().min(3).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/);
const ibanSchema = z.string().trim().min(10).max(50).regex(/^[A-Za-z0-9 ]+$/).transform((value) => value.replace(/\s+/g, "").toUpperCase());
const walletSchema = z.string().trim().min(5).max(50).regex(/^[0-9+()\-\s]+$/);
const instructionsSchema = z.string().trim().max(1000);

const receivingAccountShape = z.object({
    accountType: accountTypeSchema,
    providerName: z.string().trim().min(2).max(100),
    accountTitle: z.string().trim().min(2).max(150),
    accountNumber: accountNumberSchema,
    iban: ibanSchema.optional().nullable(),
    mobileWalletNumber: walletSchema.optional().nullable(),
    instructions: instructionsSchema.optional().nullable(),
    isActive: z.boolean().default(true)
}).strict();

export const receivingAccountCreateSchema = receivingAccountShape
    .refine(noCredentials, { message: credentialMessage })
    .refine((value) =>
        value.accountType === "bank_account" || Boolean(value.mobileWalletNumber), {
        message: "A mobile wallet number is required for wallet accounts",
        path: ["mobileWalletNumber"]
    });

// `.partial()` keeps field defaults, so `{}` would silently become
// `{ isActive: true }`. Build the optional shape explicitly instead so an
// empty update body is rejected.
export const receivingAccountUpdateSchema = receivingAccountShape.omit({ isActive: true }).extend({
    isActive: z.boolean().optional()
}).partial()
    .refine((value) => Object.keys(value).length > 0, { message: "At least one field must be provided" })
    .refine(noCredentials, { message: credentialMessage })
    .refine((value) => value.accountType === undefined
        || value.accountType === "bank_account"
        || Boolean(value.mobileWalletNumber), {
        message: "A mobile wallet number is required for wallet accounts",
        path: ["mobileWalletNumber"]
    });

export const receivingAccountStatusSchema = z.object({ isActive: z.boolean() }).strict();
export const receivingAccountParamsSchema = z.object({ accountId: objectIdSchema }).strict();
export const receivingAccountDeleteQuerySchema = z.object({ confirm: z.literal("true") }).strict();
export const receivingAccountListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(100).optional(),
    isActive: z.enum(["true", "false"]).transform((value) => value === "true").optional()
}).strict();
