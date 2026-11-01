import { z } from "zod";
import { objectIdSchema, paginationSchema } from "./common.validator.js";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Date must be a valid calendar date");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const recordFieldsSchema = z.object({
    studentId: objectIdSchema,
    status: z.enum(["present", "absent", "late", "leave"]),
    checkIn: timeSchema.optional(),
    checkOut: timeSchema.optional(),
    note: z.string().trim().max(300).optional()
}).strict();
const validateTimes = (record) => {
    if (record.status === "absent" || record.status === "leave") {
        return record.checkIn === undefined && record.checkOut === undefined;
    }
    if (record.status === "late" && record.checkIn === undefined) return false;
    return !record.checkOut || Boolean(record.checkIn && record.checkOut >= record.checkIn);
};
const recordSchema = recordFieldsSchema.refine(validateTimes, {
    message: "Check-in/out times must match the attendance status and be in chronological order"
});
const staffRecordSchema = recordFieldsSchema.omit({ studentId: true })
    .extend({ userId: objectIdSchema })
    .refine(validateTimes, {
        message: "Check-in/out times must match the attendance status and be in chronological order"
    });

export const studentAttendanceMarkSchema = z.object({
    sectionId: objectIdSchema,
    date: dateSchema,
    records: z.array(recordSchema).min(1).max(500)
}).strict().refine(({ records }) =>
    new Set(records.map(({ studentId }) => studentId)).size === records.length,
"Each student may appear only once in an attendance sheet");

export const studentAttendanceDayQuerySchema = z.object({
    sectionId: objectIdSchema,
    date: dateSchema
}).strict();

export const studentAttendanceMonthQuerySchema = paginationSchema.extend({
    sectionId: objectIdSchema,
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
}).strict();

export const staffAttendanceMarkSchema = z.object({
    date: dateSchema,
    records: z.array(staffRecordSchema).min(1).max(500)
}).strict().refine(({ records }) =>
    new Set(records.map(({ userId }) => userId)).size === records.length,
"Each staff member may appear only once in an attendance sheet");

export const staffAttendanceMonthQuerySchema = z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
}).strict();

export const staffAttendanceReportQuerySchema = paginationSchema.extend({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
}).strict();
