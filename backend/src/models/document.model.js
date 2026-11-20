import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        title: { type: String, required: true, trim: true, maxlength: 160 },
        category: {
            type: String,
            enum: ["student", "admission", "teacher", "fee_receipt", "certificate", "other"],
            default: "other",
            required: true
        },
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", default: null },
        subjectUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        fileName: { type: String, required: true, trim: true, maxlength: 240 },
        contentType: { type: String, required: true, trim: true, maxlength: 120 },
        sizeBytes: { type: Number, required: true, min: 1 },
        storageKey: { type: String, required: true, trim: true, maxlength: 512 },
        storageProvider: { type: String, enum: ["s3", "cloudinary"], default: "s3", trim: true },
        checksum: { type: String, trim: true, maxlength: 128 },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        isActive: { type: Boolean, default: true, required: true }
    },
    { timestamps: true, strict: "throw" }
);

documentSchema.index({ schoolId: 1, isActive: 1, category: 1, createdAt: -1 });
documentSchema.index({ schoolId: 1, studentId: 1, isActive: 1 });
documentSchema.index({ schoolId: 1, storageKey: 1 }, { unique: true });

const SchoolDocument = mongoose.models.SchoolDocument
    ?? mongoose.model("SchoolDocument", documentSchema);
export default SchoolDocument;
