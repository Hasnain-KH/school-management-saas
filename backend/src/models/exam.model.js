import mongoose from "mongoose";

const examSubjectSchema = new mongoose.Schema(
    {
        classSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: "ClassSubject", required: true },
        subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
        examDate: { type: Date, required: true },
        startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        durationMinutes: { type: Number, required: true, min: 1, max: 600 },
        maxMarks: { type: Number, required: true, min: 1, max: 10000 },
        passingMarks: { type: Number, required: true, min: 0, max: 10000 }
    },
    { _id: false, strict: "throw" }
);

const gradingBandSchema = new mongoose.Schema(
    {
        minPercent: { type: Number, required: true, min: 0, max: 100 },
        maxPercent: { type: Number, required: true, min: 0, max: 100 },
        grade: { type: String, required: true, trim: true, maxlength: 8 },
        remark: { type: String, trim: true, maxlength: 60 }
    },
    { _id: false, strict: "throw" }
);

const examSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", required: true },
        classId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicClass", required: true },
        name: { type: String, required: true, trim: true, maxlength: 120 },
        status: { type: String, enum: ["scheduled", "published"], default: "scheduled", required: true },
        gradingScale: { type: [gradingBandSchema], required: true },
        subjects: { type: [examSubjectSchema], validate: [(items) => items.length > 0, "At least one subject must be scheduled"] },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        publishedAt: { type: Date }
    },
    { timestamps: true, strict: "throw" }
);

examSchema.index({ schoolId: 1, academicSessionId: 1, classId: 1, name: 1 }, { unique: true });
examSchema.index({ schoolId: 1, academicSessionId: 1, classId: 1, status: 1 });

const Exam = mongoose.models.Exam ?? mongoose.model("Exam", examSchema);
export default Exam;
