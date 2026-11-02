import { z } from "zod";
import { objectIdSchema, paginationSchema } from "./common.validator.js";

export const fixedAssetCreateSchema = z.object({
    assetTag: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/),
    name: z.string().trim().min(2).max(140),
    category: z.string().trim().min(1).max(80),
    acquisitionDate: z.coerce.date(),
    costMinor: z.number().int().min(1).max(100000000000),
    salvageValueMinor: z.number().int().min(0).max(99999999999),
    currency: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
    usefulLifeMonths: z.number().int().min(1).max(1200),
    depreciationMethod: z.literal("straight_line").default("straight_line"),
    location: z.string().trim().max(120).optional()
}).strict().refine(({ costMinor, salvageValueMinor }) => salvageValueMinor < costMinor, {
    message: "Salvage value must be less than acquisition cost",
    path: ["salvageValueMinor"]
});

export const fixedAssetQuerySchema = paginationSchema.extend({
    category: z.string().trim().max(80).optional(),
    status: z.enum(["active", "disposed"]).optional()
}).strict();

export const fixedAssetParamsSchema = z.object({ assetId: objectIdSchema }).strict();
export const fixedAssetAssignmentSchema = z.object({
    assigneeType: z.enum(["user", "student"]),
    assigneeId: objectIdSchema,
    note: z.string().trim().max(300).optional()
}).strict();
export const fixedAssetReleaseSchema = z.object({
    note: z.string().trim().max(300).optional()
}).strict();
export const fixedAssetDepreciationSchema = z.object({
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
}).strict();
