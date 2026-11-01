import mongoose from "mongoose";

const examMarkSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
        classSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: "ClassSubject", required: true },
        marksObtained: { type: Number, required: true, min: 0, max: 10000 },
        remarks: { type: String, trim: true, maxlength: 300 },
        enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        enteredAt: { type: Date, required: true, default: Date.now }
    },
    { timestamps: true, strict: "throw" }
);

examMarkSchema.index({ schoolId: 1, examId: 1, studentId: 1, classSubjectId: 1 }, { unique: true });
examMarkSchema.index({ schoolId: 1, examId: 1, classSubjectId: 1, studentId: 1 });

const ExamMark = mongoose.models.ExamMark ?? mongoose.model("ExamMark", examMarkSchema);
export default ExamMark;
