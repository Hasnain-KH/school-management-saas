import { z } from "zod";
import { paginationSchema } from "./common.validator.js";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const auditQuerySchema = paginationSchema.extend({
    action: z.string().trim().min(1).max(80).optional(),
    resourceType: z.string().trim().min(1).max(80).optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional()
}).strict().refine(({ from, to }) => !from || !to || to >= from, {
    message: "End date must be on or after start date"
});
