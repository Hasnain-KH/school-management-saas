import { z } from "zod";
import { objectIdSchema } from "./common.validator.js";

export const notificationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    unreadOnly: z.enum(["true", "false"]).transform((value) => value === "true").default("false")
}).strict();

export const notificationParamsSchema = z.object({ id: objectIdSchema }).strict();
