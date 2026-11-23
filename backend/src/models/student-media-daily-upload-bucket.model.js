import mongoose from "mongoose";

// Atomic per-school/per-teacher/per-day counter for teacher daily upload limit.
// The counter is the concurrency gate; StudentMediaUploadReservation tracks
// individual reservations for idempotency, release, and stale cleanup.
const studentMediaDailyUploadBucketSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    dayKey: { type: String, required: true, trim: true, maxlength: 16 }, // YYYY-MM-DD
    // Active slots currently reserved or committed for this teacher/day.
    count: { type: Number, required: true, min: 0, default: 0 }
  },
  { timestamps: true, strict: "throw" }
);

studentMediaDailyUploadBucketSchema.index({ schoolId: 1, teacherId: 1, dayKey: 1 }, { unique: true });

const StudentMediaDailyUploadBucket = mongoose.models.StudentMediaDailyUploadBucket
  ?? mongoose.model("StudentMediaDailyUploadBucket", studentMediaDailyUploadBucketSchema);
export default StudentMediaDailyUploadBucket;
