import mongoose from "mongoose";

const studentMediaAccessLogSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        mediaId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentMedia", required: true, index: true },
        actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        actorRole: { type: String, required: true, trim: true, maxlength: 40 },
        action: { type: String, enum: ["view", "download_url", "preview", "blocked"], required: true },
        outcome: { type: String, enum: ["allowed", "denied"], required: true },
        reason: { type: String, trim: true, maxlength: 240, default: "" },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    { timestamps: { createdAt: true, updatedAt: false }, strict: "throw" }
);

studentMediaAccessLogSchema.index({ schoolId: 1, mediaId: 1, createdAt: -1 });
studentMediaAccessLogSchema.index({ schoolId: 1, actorUserId: 1, createdAt: -1 });

const StudentMediaAccessLog = mongoose.models.StudentMediaAccessLog
    ?? mongoose.model("StudentMediaAccessLog", studentMediaAccessLogSchema);
export default StudentMediaAccessLog;
