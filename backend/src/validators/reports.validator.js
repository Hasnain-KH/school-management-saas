import { z } from "zod";

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
