import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", default: null },
        actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        action: { type: String, required: true, maxlength: 80 },
        resourceType: { type: String, required: true, maxlength: 80 },
        resourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    { timestamps: { createdAt: true, updatedAt: false }, strict: "throw" }
);

auditLogSchema.index({ schoolId: 1, createdAt: -1 });
auditLogSchema.index({ actorUserId: 1, createdAt: -1 });

const AuditLog = mongoose.models.AuditLog ?? mongoose.model("AuditLog", auditLogSchema);
export default AuditLog;
