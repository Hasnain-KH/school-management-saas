import mongoose from "mongoose";

const reviewHistorySchema = new mongoose.Schema(
    {
        action: {
            type: String,
            enum: ["submitted", "resubmitted", "approved", "changes_requested", "rejected", "published", "archived", "removed", "consent_blocked", "consent_withdrawn"],
            required: true
        },
        actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        actorRole: { type: String, required: true, trim: true, maxlength: 40 },
        note: { type: String, trim: true, maxlength: 1000, default: "" },
        reason: { type: String, trim: true, maxlength: 1000, default: "" },
        at: { type: Date, default: Date.now, required: true }
    },
    { _id: false, strict: "throw" }
);

const studentMediaSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        // All identifiable students in this media. Primary student is studentIds[0].
        studentIds: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
            validate: {
                validator: (value) => Array.isArray(value) && value.length >= 1 && value.length <= 25,
                message: "At least one student is required"
            },
            required: true
        },
        primaryStudentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        uploadedByRole: { type: String, required: true, trim: true, maxlength: 40 },
        mediaType: {
            type: String,
            enum: ["photo", "video", "certificate", "project", "document"],
            required: true
        },
        category: {
            type: String,
            enum: ["photo", "video", "certificate", "project", "educational_activity", "school_event", "achievement", "other"],
            required: true
        },
        title: { type: String, required: true, trim: true, maxlength: 160 },
        description: { type: String, trim: true, maxlength: 2000, default: "" },
        teacherNote: { type: String, trim: true, maxlength: 2000, default: "" },
        eventDate: { type: Date, default: null },
        fileName: { type: String, required: true, trim: true, maxlength: 240 },
        contentType: { type: String, required: true, trim: true, maxlength: 120 },
        sizeBytes: { type: Number, required: true, min: 1 },
        durationSeconds: { type: Number, min: 0, max: 36000, default: null },
        // Browser-reported duration is advisory only. Publication of videos is
        // blocked unless duration was verified from trusted provider metadata.
        durationVerified: { type: Boolean, default: false, required: true },
        durationSource: { type: String, enum: ["unverified", "provider"], default: "unverified", required: true },
        metadataVerifiedAt: { type: Date, default: null },
        uploadMode: { type: String, enum: ["base64", "direct"], default: "base64", required: true },
        storageProvider: { type: String, enum: ["s3", "cloudinary"], required: true },
        storageKey: { type: String, required: true, trim: true, maxlength: 512 },
        checksum: { type: String, trim: true, maxlength: 128, default: "" },
        reviewStatus: {
            type: String,
            enum: ["pending_review", "changes_requested", "approved", "rejected", "archived", "removed"],
            default: "pending_review",
            required: true
        },
        publicationStatus: {
            type: String,
            enum: ["draft", "approved_unpublished", "published", "unpublished", "archived", "removed"],
            default: "draft",
            required: true
        },
        consentStatus: {
            type: String,
            enum: ["pending", "verified", "blocked", "withdrawn", "not_required"],
            default: "pending",
            required: true
        },
        consentCheckedAt: { type: Date, default: null },
        consentCheckedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewNote: { type: String, trim: true, maxlength: 1000, default: "" },
        rejectionReason: { type: String, trim: true, maxlength: 1000, default: "" },
        changeRequestReason: { type: String, trim: true, maxlength: 1000, default: "" },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewedAt: { type: Date, default: null },
        publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        publishedAt: { type: Date, default: null },
        archivedAt: { type: Date, default: null },
        removedAt: { type: Date, default: null },
        removedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        isActive: { type: Boolean, default: true, required: true },
        reviewHistory: { type: [reviewHistorySchema], default: [] }
    },
    { timestamps: true, strict: "throw" }
);

studentMediaSchema.index({ schoolId: 1, isActive: 1, reviewStatus: 1, createdAt: -1 });
studentMediaSchema.index({ schoolId: 1, isActive: 1, publicationStatus: 1, publishedAt: -1 });
studentMediaSchema.index({ schoolId: 1, primaryStudentId: 1, isActive: 1, createdAt: -1 });
studentMediaSchema.index({ schoolId: 1, studentIds: 1, isActive: 1, publicationStatus: 1 });
studentMediaSchema.index({ schoolId: 1, uploadedBy: 1, createdAt: -1 });
studentMediaSchema.index({ schoolId: 1, storageKey: 1 }, { unique: true });
studentMediaSchema.index({ schoolId: 1, category: 1, mediaType: 1, createdAt: -1 });

const StudentMedia = mongoose.models.StudentMedia ?? mongoose.model("StudentMedia", studentMediaSchema);
export default StudentMedia;
