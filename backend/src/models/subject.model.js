import mongoose from "mongoose";

const subjectSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 100 },
        code: { type: String, required: true, trim: true, uppercase: true, maxlength: 24 },
        category: { type: String, enum: ["core", "elective"], default: "core" },
        isActive: { type: Boolean, default: true, required: true }
    },
    { timestamps: true, strict: "throw" }
);

subjectSchema.index({ schoolId: 1, code: 1 }, { unique: true });
subjectSchema.index({ schoolId: 1, isActive: 1, name: 1 });

const Subject = mongoose.models.Subject ?? mongoose.model("Subject", subjectSchema);
export default Subject;
