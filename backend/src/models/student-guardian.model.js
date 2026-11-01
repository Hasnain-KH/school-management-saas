import mongoose from "mongoose";

const studentGuardianSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
        guardianId: { type: mongoose.Schema.Types.ObjectId, ref: "Guardian", required: true },
        isPrimary: { type: Boolean, default: false, required: true }
    },
    { timestamps: true, strict: "throw" }
);

studentGuardianSchema.index({ schoolId: 1, studentId: 1, guardianId: 1 }, { unique: true });
studentGuardianSchema.index(
    { schoolId: 1, studentId: 1, isPrimary: 1 },
    { unique: true, partialFilterExpression: { isPrimary: true } }
);
studentGuardianSchema.index({ schoolId: 1, guardianId: 1 });

const StudentGuardian = mongoose.models.StudentGuardian
    ?? mongoose.model("StudentGuardian", studentGuardianSchema);
export default StudentGuardian;
