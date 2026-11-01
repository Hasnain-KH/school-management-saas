import { z } from "zod";
import { emailSchema, objectIdSchema, paginationSchema } from "./common.validator.js";

const nameSchema = z.string().trim().min(1).max(80);

export const studentAdmissionSchema = z.object({
    admissionNumber: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/),
    firstName: nameSchema,
    lastName: nameSchema,
    dateOfBirth: z.coerce.date(),
    gender: z.enum(["female", "male", "other", "unspecified"]).optional(),
    admissionDate: z.coerce.date().optional(),
    branchId: objectIdSchema,
    academicSessionId: objectIdSchema,
    classId: objectIdSchema,
    sectionId: objectIdSchema,
    guardianIds: z.array(objectIdSchema).max(5).optional()
}).strict();

export const studentUpdateSchema = z.object({
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    dateOfBirth: z.coerce.date().optional(),
    gender: z.enum(["female", "male", "other", "unspecified"]).optional()
}).strict().refine((value) => Object.keys(value).length > 0);

export const studentTransitionSchema = z.object({
    academicSessionId: objectIdSchema,
    classId: objectIdSchema,
    sectionId: objectIdSchema,
    branchId: objectIdSchema,
    notes: z.string().trim().max(500).optional()
}).strict();

export const studentStatusSchema = z.object({
    status: z.enum(["withdrawn", "transferred", "graduated"]),
    effectiveAt: z.coerce.date().optional(),
    notes: z.string().trim().max(500).optional()
}).strict();

export const leavingCertificateSchema = z.object({
    remarks: z.string().trim().max(500).optional()
}).strict();

export const studentQuerySchema = paginationSchema.extend({
    status: z.enum(["enrolled", "withdrawn", "transferred", "graduated"]).optional(),
    academicSessionId: objectIdSchema.optional(),
    classId: objectIdSchema.optional(),
    sectionId: objectIdSchema.optional(),
    branchId: objectIdSchema.optional()
}).strict();

export const guardianCreateSchema = z.object({
    name: z.string().trim().min(2).max(120),
    email: emailSchema.optional(),
    phone: z.string().trim().min(3).max(30),
    relationship: z.enum(["mother", "father", "guardian", "grandparent", "other"]),
    address: z.string().trim().max(240).optional()
}).strict();

export const guardianUpdateSchema = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    email: emailSchema.nullable().optional(),
    phone: z.string().trim().min(3).max(30).optional(),
    relationship: z.enum(["mother", "father", "guardian", "grandparent", "other"]).optional(),
    address: z.string().trim().max(240).nullable().optional()
}).strict().refine((value) => Object.keys(value).length > 0);

export const guardianQuerySchema = paginationSchema.extend({
    search: z.string().trim().max(100).optional()
}).strict();

export const studentGuardianSchema = z.object({
    isPrimary: z.boolean().default(false)
}).strict();

export const studentGuardianQuerySchema = z.object({
    guardianId: objectIdSchema,
    isPrimary: z.boolean().default(false)
}).strict();
