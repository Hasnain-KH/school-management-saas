import { z } from "zod";

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");

export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(100).optional(),
    sortBy: z.enum(["name", "code", "level", "startDate", "endDate", "createdAt", "dayOfWeek"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).default("asc")
}).strict();

export const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
export const passwordSchema = z.string().min(12).max(72).refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    "Password must not exceed 72 UTF-8 bytes"
);

export const validate = (schema, source = "body") => (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
        return next(result.error);
    }

    Object.defineProperty(req, source, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: result.data
    });
    return next();
};
