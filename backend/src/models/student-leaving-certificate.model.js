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

const studentLeavingCertificateSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
        certificateNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 64 },
        schoolName: { type: String, required: true, trim: true, maxlength: 160 },
        student: {
            admissionNumber: { type: String, required: true, maxlength: 40 },
            firstName: { type: String, required: true, maxlength: 80 },
            lastName: { type: String, required: true, maxlength: 80 },
            dateOfBirth: { type: Date, required: true }
        },
        lastPlacement: { type: placementSchema, required: true },
        studentStatus: {
            type: String,
            enum: ["withdrawn", "transferred", "graduated"],
            required: true
        },
        leavingDate: { type: Date, required: true },
        remarks: { type: String, trim: true, maxlength: 500 },
        issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        issuedAt: { type: Date, required: true, default: Date.now }
    },
    { timestamps: true, strict: "throw" }
);

studentLeavingCertificateSchema.index({ schoolId: 1, studentId: 1 }, { unique: true });
studentLeavingCertificateSchema.index({ schoolId: 1, certificateNumber: 1 }, { unique: true });

const StudentLeavingCertificate = mongoose.models.StudentLeavingCertificate
    ?? mongoose.model("StudentLeavingCertificate", studentLeavingCertificateSchema);
export default StudentLeavingCertificate;
