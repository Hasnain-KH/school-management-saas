import mongoose from "mongoose";

const academicClassSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 80 },
        code: { type: String, required: true, trim: true, uppercase: true, maxlength: 24 },
        level: { type: Number, min: 0, max: 30 },
        isActive: { type: Boolean, default: true, required: true }
    },
    { timestamps: true, strict: "throw" }
);

academicClassSchema.index({ schoolId: 1, code: 1 }, { unique: true });
academicClassSchema.index({ schoolId: 1, isActive: 1, level: 1 });

const AcademicClass = mongoose.models.AcademicClass
    ?? mongoose.model("AcademicClass", academicClassSchema);
export default AcademicClass;
