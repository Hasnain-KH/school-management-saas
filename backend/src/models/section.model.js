import mongoose from "mongoose";

const sectionSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", required: true },
        classId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicClass", required: true },
        branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
        name: { type: String, required: true, trim: true, maxlength: 40 },
        capacity: { type: Number, min: 1, max: 500, default: 40 },
        enrolledCount: { type: Number, min: 0, default: 0, required: true },
        isActive: { type: Boolean, default: true, required: true }
    },
    { timestamps: true, strict: "throw" }
);

sectionSchema.index(
    { schoolId: 1, academicSessionId: 1, classId: 1, name: 1 },
    { unique: true }
);
sectionSchema.index({ schoolId: 1, academicSessionId: 1, branchId: 1, isActive: 1 });

const Section = mongoose.models.Section ?? mongoose.model("Section", sectionSchema);
export default Section;
