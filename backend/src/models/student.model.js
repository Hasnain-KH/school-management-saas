import mongoose from "mongoose";

const studentSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        admissionNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
        firstName: { type: String, required: true, trim: true, maxlength: 80 },
        lastName: { type: String, required: true, trim: true, maxlength: 80 },
        dateOfBirth: { type: Date, required: true },
        gender: { type: String, enum: ["female", "male", "other", "unspecified"], default: "unspecified" },
        admissionDate: { type: Date, required: true, default: Date.now },
        status: {
            type: String,
            enum: ["enrolled", "withdrawn", "transferred", "graduated"],
            default: "enrolled",
            required: true
        },
        branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
        academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", required: true },
        classId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicClass", required: true },
        sectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true }
    },
    { timestamps: true, strict: "throw" }
);

studentSchema.index({ schoolId: 1, admissionNumber: 1 }, { unique: true });
studentSchema.index({ schoolId: 1, status: 1, academicSessionId: 1, sectionId: 1 });
studentSchema.index({ schoolId: 1, lastName: 1, firstName: 1 });

const Student = mongoose.models.Student ?? mongoose.model("Student", studentSchema);
export default Student;
