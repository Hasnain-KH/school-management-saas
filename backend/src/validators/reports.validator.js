import { z } from "zod";
import { objectIdSchema, paginationSchema } from "./common.validator.js";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Date must be a valid calendar date");

export const attendanceReportQuerySchema = z.object({
    from: dateSchema,
    to: dateSchema
}).strict().refine(({ from, to }) => to >= from, {
    message: "Report end date must be on or after start date",
    path: ["to"]
}).refine(({ from, to }) =>
    new Date(`${to}T00:00:00.000Z`) - new Date(`${from}T00:00:00.000Z`)
        <= 366 * 24 * 60 * 60 * 1000,
"Report date range cannot exceed 366 days");

export const financialReportQuerySchema = z.object({
    from: dateSchema,
    to: dateSchema
}).strict().refine(({ from, to }) => to >= from, {
    message: "Report end date must be on or after start date",
    path: ["to"]
}).refine(({ from, to }) =>
    new Date(`${to}T00:00:00.000Z`) - new Date(`${from}T00:00:00.000Z`)
        <= 366 * 24 * 60 * 60 * 1000,
"Report date range cannot exceed 366 days");

const optionalDate = dateSchema.optional();
const optionalId = objectIdSchema.optional();
const reportDateRange = {
    from: optionalDate,
    to: optionalDate
};
const reportDateRangeSchema = (fields) => z.object({
    ...reportDateRange,
    ...fields,
    page: paginationSchema.shape.page,
    limit: paginationSchema.shape.limit
}).strict().refine(({ from, to }) => !from || !to || to >= from, {
    message: "Report end date must be on or after start date",
    path: ["to"]
}).refine(({ from, to }) => !from || !to
    || new Date(`${to}T00:00:00.000Z`) - new Date(`${from}T00:00:00.000Z`)
        <= 366 * 24 * 60 * 60 * 1000, {
    message: "Report date range cannot exceed 366 days"
});

export const studentRecordsQuerySchema = reportDateRangeSchema({
    classId: optionalId,
    academicSessionId: optionalId,
    studentId: optionalId,
    status: z.enum(["enrolled", "withdrawn", "transferred", "graduated"]).optional()
});

export const attendanceRecordsQuerySchema = reportDateRangeSchema({
    classId: optionalId,
    academicSessionId: optionalId,
    studentId: optionalId,
    status: z.enum(["present", "absent", "late", "leave"]).optional()
});

export const feeCollectionRecordsQuerySchema = reportDateRangeSchema({
    classId: optionalId,
    studentId: optionalId,
    method: z.enum(["cash", "bank_transfer", "cheque", "other"]).optional()
});

export const feeDueRecordsQuerySchema = reportDateRangeSchema({
    classId: optionalId,
    studentId: optionalId,
    status: z.enum(["unpaid", "partial"]).optional()
});

export const classSessionRecordsQuerySchema = z.object({
    classId: optionalId,
    academicSessionId: optionalId,
    page: paginationSchema.shape.page,
    limit: paginationSchema.shape.limit
}).strict();

export const examResultRecordsQuerySchema = reportDateRangeSchema({
    classId: optionalId,
    academicSessionId: optionalId,
    studentId: optionalId,
    status: z.enum(["passed", "failed"]).optional()
});
