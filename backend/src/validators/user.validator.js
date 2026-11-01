import { z } from "zod";
import { emailSchema, paginationSchema, passwordSchema } from "./common.validator.js";

export const userCreateSchema = z.object({
    name: z.string().trim().min(2).max(120),
    email: emailSchema,
    phone: z.string().trim().min(3).max(30).optional(),
    jobTitle: z.string().trim().min(2).max(80).optional(),
    role: z.enum(["principal", "teacher", "parent"]),
    password: passwordSchema
}).strict();

export const userUpdateSchema = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().min(3).max(30).nullable().optional(),
    jobTitle: z.string().trim().min(2).max(80).nullable().optional(),
    status: z.enum(["active", "disabled"]).optional()
}).strict().refine((value) => Object.keys(value).length > 0);

export const userQuerySchema = paginationSchema.extend({
    role: z.enum(["school_admin", "principal", "teacher", "parent"]).optional(),
    status: z.enum(["active", "disabled"]).optional()
}).strict();
