import mongoose from "mongoose";

// Tracks scheduled job executions so repeated invocations (cron retries, manual
// triggers, multiple serverless instances) never run the same logical job twice.
const jobRunSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 60 },
        runKey: { type: String, required: true, trim: true, maxlength: 120 },
        status: { type: String, enum: ["running", "completed", "failed"], default: "running", required: true },
        attempts: { type: Number, min: 1, default: 1, required: true },
        startedAt: { type: Date, required: true, default: Date.now },
        finishedAt: { type: Date },
        leaseExpiresAt: { type: Date },
        errorCode: { type: String, maxlength: 120 },
        result: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    { timestamps: true, strict: "throw" }
);

jobRunSchema.index({ name: 1, runKey: 1 }, { unique: true });
jobRunSchema.index({ startedAt: -1 });

const JobRun = mongoose.models.JobRun ?? mongoose.model("JobRun", jobRunSchema);
export default JobRun;
