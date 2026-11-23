import mongoose from "mongoose";

// Per-tenant application quota counter for student media. Used for atomic
// reservation to keep concurrent uploads from exceeding the configured quota.
// Source of truth for enforcement is this counter; usage summary may reconcile
// from actual media aggregates when needed.
const studentMediaQuotaSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, unique: true, index: true },
    usedBytes: { type: Number, required: true, min: 0, default: 0 }
  },
  { timestamps: true, strict: "throw" }
);

const StudentMediaQuota = mongoose.models.StudentMediaQuota
  ?? mongoose.model("StudentMediaQuota", studentMediaQuotaSchema);
export default StudentMediaQuota;
