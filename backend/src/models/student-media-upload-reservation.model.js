import mongoose from "mongoose";

// Tracks individual teacher daily-upload reservations. Used for idempotency,
// failure release, and stale-reservation cleanup. The atomic daily limit gate
// is enforced via StudentMediaDailyUploadBucket.
const studentMediaUploadReservationSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    dayKey: { type: String, required: true, trim: true, maxlength: 16 }, // YYYY-MM-DD in school timezone or UTC
    // Client/request-supplied idempotency key. Retries with the same key must
    // not consume multiple daily slots.
    dedupeKey: { type: String, required: true, trim: true, maxlength: 128 },
    status: { type: String, enum: ["reserved", "committed", "released"], default: "reserved", required: true },
    // Reserved slots expire so crashed/abandoned reservations cannot permanently
    // consume the daily limit.
    expiresAt: { type: Date, required: true },
    // Tracks whether the daily bucket counter was incremented for this reservation.
    // Prevents stale cleanup from decrementing a bucket slot that was never claimed.
    bucketClaimed: { type: Boolean, default: false, required: true },
    committedAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
    releaseReason: { type: String, trim: true, maxlength: 120, default: "" },
    // Direct-upload state. Stored as one named subdocument so all new fields
    // are declared up front for this strict schema.
    directUpload: { type: mongoose.Schema.Types.Mixed, default: null },
    // Short, independently enforced authorization lifetime. The daily slot may
    // live longer, but the browser upload authorization must expire quickly.
    uploadAuthExpiresAt: { type: Date, default: null },
    completionStatus: { type: String, enum: ["none", "completed", "failed"], default: "none", required: true },
    completedAt: { type: Date, default: null },
    mediaId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentMedia", default: null }
  },
  { timestamps: true, strict: "throw" }
);

studentMediaUploadReservationSchema.index(
  { schoolId: 1, teacherId: 1, dayKey: 1, dedupeKey: 1 },
  { unique: true }
);
studentMediaUploadReservationSchema.index({ schoolId: 1, teacherId: 1, dayKey: 1, status: 1, expiresAt: 1 });
studentMediaUploadReservationSchema.index({ status: 1, expiresAt: 1 });

const StudentMediaUploadReservation = mongoose.models.StudentMediaUploadReservation
  ?? mongoose.model("StudentMediaUploadReservation", studentMediaUploadReservationSchema);
export default StudentMediaUploadReservation;
