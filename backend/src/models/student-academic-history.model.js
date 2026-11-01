import mongoose from "mongoose";

const placementSchema = new mongoose.Schema(
    {
        academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", required: true },
        classId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicClass", required: true },
        sectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true },
        branchId: { type: mongoose.Schema.Types.ObjectId, required: true }
    },
    { _id: false, strict: "throw" }
);

const studentAcademicHistorySchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
        eventType: {
            type: String,
            enum: ["admitted", "promoted", "transferred", "withdrawn", "graduated"],
            required: true
        },
        from: { type: placementSchema, default: undefined },
        to: { type: placementSchema, default: undefined },
        effectiveAt: { type: Date, required: true, default: Date.now },
        actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        notes: { type: String, trim: true, maxlength: 500 }
    },
    { timestamps: true, strict: "throw" }
);

studentAcademicHistorySchema.index({ schoolId: 1, studentId: 1, createdAt: -1 });
studentAcademicHistorySchema.index({ schoolId: 1, eventType: 1, effectiveAt: -1 });

const StudentAcademicHistory = mongoose.models.StudentAcademicHistory
    ?? mongoose.model("StudentAcademicHistory", studentAcademicHistorySchema);
export default StudentAcademicHistory;
