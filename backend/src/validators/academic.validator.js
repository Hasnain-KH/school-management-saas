import { z } from "zod";
import { objectIdSchema, paginationSchema } from "./common.validator.js";

const nameSchema = z.string().trim().min(1).max(100);
const codeSchema = z.string().trim().min(1).max(24).regex(/^[A-Za-z0-9_-]+$/);
const dateSchema = z.coerce.date();
const booleanQuerySchema = z.enum(["true", "false"]).transform((value) => value === "true");

export const academicSessionQuerySchema = paginationSchema.extend({
    status: z.enum(["upcoming", "active", "completed"]).optional()
}).strict();

export const classQuerySchema = paginationSchema.extend({
    isActive: booleanQuerySchema.optional()
}).strict();

export const branchCreateSchema = z.object({
    name: z.string().trim().min(1).max(100),
    code: codeSchema
}).strict();

export const branchUpdateSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    code: codeSchema.optional()
}).strict().refine((value) => Object.keys(value).length > 0);

export const idParamsSchema = z.object({ id: objectIdSchema }).strict();
export const sectionParamsSchema = z.object({ sectionId: objectIdSchema }).strict();

export const academicSessionCreateSchema = z.object({
    name: z.string().trim().min(2).max(80),
    startDate: dateSchema,
    endDate: dateSchema
}).strict().refine(({ startDate, endDate }) => endDate > startDate, {
    message: "Session end date must be after its start date"
});

export const academicSessionUpdateSchema = z.object({
    name: z.string().trim().min(2).max(80).optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional()
}).strict().refine((value) => Object.keys(value).length > 0);

export const classCreateSchema = z.object({
    name: nameSchema,
    code: codeSchema,
    level: z.number().int().min(0).max(30).optional()
}).strict();

export const classUpdateSchema = z.object({
    name: nameSchema.optional(),
    code: codeSchema.optional(),
    level: z.number().int().min(0).max(30).nullable().optional(),
    isActive: z.boolean().optional()
}).strict().refine((value) => Object.keys(value).length > 0);

export const sectionCreateSchema = z.object({
    academicSessionId: objectIdSchema,
    classId: objectIdSchema,
    branchId: objectIdSchema,
    name: z.string().trim().min(1).max(40),
    capacity: z.number().int().min(1).max(500).optional()
}).strict();

export const sectionUpdateSchema = z.object({
    name: z.string().trim().min(1).max(40).optional(),
    capacity: z.number().int().min(1).max(500).optional(),
    branchId: objectIdSchema.optional(),
    isActive: z.boolean().optional()
}).strict().refine((value) => Object.keys(value).length > 0);

export const subjectCreateSchema = z.object({
    name: z.string().trim().min(1).max(100),
    code: codeSchema,
    category: z.enum(["core", "elective"]).optional()
}).strict();

export const subjectUpdateSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    code: codeSchema.optional(),
    category: z.enum(["core", "elective"]).optional(),
    isActive: z.boolean().optional()
}).strict().refine((value) => Object.keys(value).length > 0);

export const classSubjectCreateSchema = z.object({
    academicSessionId: objectIdSchema,
    classId: objectIdSchema,
    subjectId: objectIdSchema,
    teacherId: objectIdSchema.optional(),
    periodsPerWeek: z.number().int().min(1).max(40).optional()
}).strict();

export const classSubjectQuerySchema = paginationSchema.extend({
    academicSessionId: objectIdSchema.optional(),
    classId: objectIdSchema.optional(),
    isActive: booleanQuerySchema.optional()
}).strict();
export const sectionQuerySchema = paginationSchema.extend({
    academicSessionId: objectIdSchema.optional(),
    classId: objectIdSchema.optional(),
    branchId: objectIdSchema.optional(),
    isActive: booleanQuerySchema.optional()
}).strict();
export const subjectQuerySchema = paginationSchema.extend({
    isActive: booleanQuerySchema.optional()
}).strict();

export const classTeacherSchema = z.object({
    academicSessionId: objectIdSchema,
    teacherId: objectIdSchema
}).strict();

export const timetableCreateSchema = z.object({
    academicSessionId: objectIdSchema,
    sectionId: objectIdSchema,
    classSubjectId: objectIdSchema,
    dayOfWeek: z.number().int().min(1).max(7),
    periodNumber: z.number().int().min(1).max(20),
    startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    room: z.string().trim().min(1).max(40).optional()
}).strict().refine(({ startsAt, endsAt }) => endsAt > startsAt, {
    message: "Period end time must be after its start time"
});

export const timetableQuerySchema = paginationSchema.extend({
    academicSessionId: objectIdSchema,
    sectionId: objectIdSchema.optional(),
    dayOfWeek: z.coerce.number().int().min(1).max(7).optional()
}).strict();
