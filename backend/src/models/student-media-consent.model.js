import mongoose from "mongoose";

const consentHistorySchema = new mongoose.Schema(
    {
        action: { type: String, enum: ["granted", "updated", "withdrawn", "verified", "blocked"], required: true },
        actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        actorRole: { type: String, required: true, trim: true, maxlength: 40 },
        note: { type: String, trim: true, maxlength: 1000, default: "" },
        at: { type: Date, default: Date.now, required: true }
    },
    { _id: false, strict: "throw" }
);

const studentMediaConsentSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
        guardianId: { type: mongoose.Schema.Types.ObjectId, ref: "Guardian", required: true },
        guardianUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        // The actual consenting guardian identity is represented by guardianId/guardianUserId.
        // When consent is recorded by an administrator on behalf of that guardian (e.g. paper form),
        // recordedBy* and verificationEvidence distinguish the recorder from the consenting guardian.
        recordedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        recordedByRole: { type: String, trim: true, maxlength: 40, default: "" },
        consentSource: {
            type: String,
            enum: ["guardian_portal", "school_recorded_paper", "school_recorded_phone", "school_recorded_in_person", "other"],
            default: "guardian_portal"
        },
        verificationEvidence: { type: String, trim: true, maxlength: 2000, default: "" },
        consentingGuardianName: { type: String, trim: true, maxlength: 160, default: "" },
        status: { type: String, enum: ["granted", "withdrawn", "blocked"], default: "granted", required: true },
        scope: {
            type: String,
            enum: ["all", "photos", "videos", "certificates", "projects", "activities", "events", "achievements"],
            default: "all",
            required: true
        },
        categories: {
            type: [{ type: String, trim: true, maxlength: 60 }],
            default: []
        },
        grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        grantedAt: { type: Date, default: null },
        withdrawnBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        withdrawnAt: { type: Date, default: null },
        notes: { type: String, trim: true, maxlength: 1000, default: "" },
        isActive: { type: Boolean, default: true, required: true },
        history: { type: [consentHistorySchema], default: [] }
    },
    { timestamps: true, strict: "throw" }
);

studentMediaConsentSchema.index({ schoolId: 1, studentId: 1, guardianId: 1, scope: 1 }, { unique: true });
studentMediaConsentSchema.index({ schoolId: 1, studentId: 1, status: 1, isActive: 1 });
studentMediaConsentSchema.index({ schoolId: 1, guardianId: 1, isActive: 1 });

const StudentMediaConsent = mongoose.models.StudentMediaConsent
    ?? mongoose.model("StudentMediaConsent", studentMediaConsentSchema);
export default StudentMediaConsent;
