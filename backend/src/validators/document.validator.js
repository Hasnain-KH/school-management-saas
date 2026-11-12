import { z } from "zod";
import { objectIdSchema } from "./common.validator.js";

// Documents are uploaded as base64 JSON so the API stays dependency-free and
// works identically on Vercel serverless. The decoded size is validated here and
// the router allows a larger JSON body for this path only.
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_ALLOWED_CONTENT_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
];

const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;

export const documentCreateSchema = z.object({
    title: z.string().trim().min(2).max(160),
    category: z.enum(["student", "admission", "teacher", "fee_receipt", "certificate", "other"]).default("other"),
    fileName: z.string().trim().min(1).max(240),
    contentType: z.enum(DOCUMENT_ALLOWED_CONTENT_TYPES),
    dataBase64: z.string().min(1).max(Math.ceil(DOCUMENT_MAX_BYTES / 3) * 4 + 16).regex(base64Pattern, "File data must be valid base64"),
    studentId: objectIdSchema.optional(),
    subjectUserId: objectIdSchema.optional()
}).strict().refine((value) => {
    const padding = value.dataBase64.endsWith("==") ? 2 : value.dataBase64.endsWith("=") ? 1 : 0;
    return Math.floor((value.dataBase64.length * 3) / 4) - padding <= DOCUMENT_MAX_BYTES;
}, { message: `File must not exceed ${DOCUMENT_MAX_BYTES} bytes`, path: ["dataBase64"] });

export const documentQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    category: z.enum(["student", "admission", "teacher", "fee_receipt", "certificate", "other"]).optional(),
    studentId: objectIdSchema.optional()
}).strict();

export const documentParamsSchema = z.object({ id: objectIdSchema }).strict();
