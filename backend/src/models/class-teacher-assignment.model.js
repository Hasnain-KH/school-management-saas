import mongoose from "mongoose";

const classTeacherAssignmentSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", required: true },
        sectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true },
        teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
    },
    { timestamps: true, strict: "throw" }
);

classTeacherAssignmentSchema.index(
    { schoolId: 1, academicSessionId: 1, sectionId: 1 },
    { unique: true }
);
classTeacherAssignmentSchema.index({ schoolId: 1, academicSessionId: 1, teacherId: 1 });

const ClassTeacherAssignment = mongoose.models.ClassTeacherAssignment
    ?? mongoose.model("ClassTeacherAssignment", classTeacherAssignmentSchema);
export default ClassTeacherAssignment;
