import mongoose from "mongoose";

const classSubjectSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", required: true },
        classId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicClass", required: true },
        subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
        teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        periodsPerWeek: { type: Number, min: 1, max: 40, default: 1 },
        isActive: { type: Boolean, default: true, required: true }
    },
    { timestamps: true, strict: "throw" }
);

classSubjectSchema.index(
    { schoolId: 1, academicSessionId: 1, classId: 1, subjectId: 1 },
    { unique: true }
);
classSubjectSchema.index({ schoolId: 1, academicSessionId: 1, teacherId: 1 });

const ClassSubject = mongoose.models.ClassSubject
    ?? mongoose.model("ClassSubject", classSubjectSchema);
export default ClassSubject;
