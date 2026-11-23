import mongoose from "mongoose";

// Durable, idempotent compensation ledger for Student Media side effects that
// cannot be rolled back inside a MongoDB transaction (object storage, quota and
// daily-slot counters). Tasks are processed only by an explicitly invoked
// manual job; no production scheduler starts automatically.
const studentMediaCleanupTaskSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 240 },
    kind: {
      type: String,
      enum: [
        "direct_upload",
        "direct_resubmit",
        "storage_delete",
        "quota_release",
        "daily_slot_release",
        "consent_suspension"
      ],
      required: true
    },
    phase: { type: String, trim: true, maxlength: 60, default: "pending", required: true },
    status: { type: String, enum: ["pending", "running", "done", "failed"], default: "pending", required: true },
    attempts: { type: Number, min: 1, default: 1, required: true },
    leaseExpiresAt: { type: Date, default: null },
    nextAttemptAt: { type: Date, default: null },
    lastErrorCode: { type: String, trim: true, maxlength: 120, default: "" },
    // Allowlisted, non-sensitive payload only. Never contains provider secrets,
    // signed URLs, signatures, or raw file contents.
    payload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    result: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
  },
  { timestamps: true, strict: "throw" }
);

studentMediaCleanupTaskSchema.index({ schoolId: 1, idempotencyKey: 1 }, { unique: true });
studentMediaCleanupTaskSchema.index({ status: 1, nextAttemptAt: 1, leaseExpiresAt: 1 });
studentMediaCleanupTaskSchema.index({ schoolId: 1, createdAt: -1 });

const StudentMediaCleanupTask = mongoose.models.StudentMediaCleanupTask
  ?? mongoose.model("StudentMediaCleanupTask", studentMediaCleanupTaskSchema);
export default StudentMediaCleanupTask;
