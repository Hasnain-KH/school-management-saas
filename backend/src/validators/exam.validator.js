import { z } from "zod";
import { objectIdSchema, paginationSchema } from "./common.validator.js";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Date must be a valid calendar date");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const gradingBandSchema = z.object({
    minPercent: z.number().min(0).max(100),
    maxPercent: z.number().min(0).max(100),
    grade: z.string().trim().min(1).max(8),
    remark: z.string().trim().max(60).optional()
}).strict();

const examSubjectSchema = z.object({
    classSubjectId: objectIdSchema,
    examDate: dateSchema,
    startTime: timeSchema,
    durationMinutes: z.number().int().min(1).max(600),
    maxMarks: z.number().positive().max(10000),
    passingMarks: z.number().min(0).max(10000)
}).strict().refine(({ maxMarks, passingMarks }) => passingMarks <= maxMarks, {
    message: "Passing marks cannot exceed maximum marks",
    path: ["passingMarks"]
});

export const examCreateSchema = z.object({
    academicSessionId: objectIdSchema,
    classId: objectIdSchema,
    name: z.string().trim().min(2).max(120),
    gradingScale: z.array(gradingBandSchema).min(1).max(20),
    subjects: z.array(examSubjectSchema).min(1).max(50)
}).strict().refine(({ gradingScale }) => {
    const bands = [...gradingScale].sort((a, b) => a.minPercent - b.minPercent);
    if (bands[0].minPercent !== 0 || bands.at(-1).maxPercent !== 100) return false;
    if (new Set(bands.map(({ grade }) => grade)).size !== bands.length) return false;
    return bands.every((band, index) =>
        band.maxPercent >= band.minPercent
        && (index === 0 || bands[index - 1].maxPercent === band.minPercent)
    );
}, "Grading bands must be unique, non-overlapping, and continuously cover percentages from 0 to 100")
    .refine(({ subjects }) =>
        new Set(subjects.map(({ classSubjectId }) => classSubjectId)).size === subjects.length,
    "Each class subject may appear only once in an exam")
    .refine(({ subjects }) => {
        const byDay = new Map();
        for (const subject of subjects) {
            const start = Number(subject.startTime.slice(0, 2)) * 60 + Number(subject.startTime.slice(3));
            const entry = { start, end: start + subject.durationMinutes };
            const day = byDay.get(subject.examDate) ?? [];
            if (day.some((existing) => entry.start < existing.end && entry.end > existing.start)) return false;
            day.push(entry);
            byDay.set(subject.examDate, day);
        }
        return true;
    }, "Exam subject schedules on the same day must not overlap");

const marksRecordSchema = z.object({
    studentId: objectIdSchema,
    marksObtained: z.number().min(0).max(10000),
    remarks: z.string().trim().max(300).optional()
}).strict();

export const examMarksSchema = z.object({
    classSubjectId: objectIdSchema,
    records: z.array(marksRecordSchema).min(1).max(500)
}).strict().refine(({ records }) =>
    new Set(records.map(({ studentId }) => studentId)).size === records.length,
"Each student may appear only once in a marks submission");

export const examQuerySchema = paginationSchema.extend({
    academicSessionId: objectIdSchema.optional(),
    classId: objectIdSchema.optional(),
    status: z.enum(["scheduled", "published"]).optional()
}).strict();

export const examParamsSchema = z.object({ examId: objectIdSchema }).strict();
export const reportCardParamsSchema = z.object({
    examId: objectIdSchema,
    studentId: objectIdSchema
}).strict();

export const examResultsQuerySchema = paginationSchema.extend({
    sortBy: z.enum(["name", "percentage", "admissionNumber"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).default("asc")
}).strict();
