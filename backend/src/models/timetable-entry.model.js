import mongoose from "mongoose";

const timetableEntrySchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", required: true },
        sectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true },
        classSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: "ClassSubject", required: true },
        teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        dayOfWeek: { type: Number, min: 1, max: 7, required: true },
        periodNumber: { type: Number, min: 1, max: 20, required: true },
        startsAt: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, required: true },
        endsAt: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, required: true },
        room: { type: String, trim: true, maxlength: 40 }
    },
    { timestamps: true, strict: "throw" }
);

timetableEntrySchema.path("endsAt").validate(function endAfterStart(value) {
    return !this.startsAt || value > this.startsAt;
}, "Period end time must be after its start time");

timetableEntrySchema.index(
    { schoolId: 1, academicSessionId: 1, sectionId: 1, dayOfWeek: 1, periodNumber: 1 },
    { unique: true }
);
timetableEntrySchema.index(
    { schoolId: 1, academicSessionId: 1, teacherId: 1, dayOfWeek: 1, periodNumber: 1 },
    { unique: true }
);
timetableEntrySchema.index(
    { schoolId: 1, academicSessionId: 1, room: 1, dayOfWeek: 1, periodNumber: 1 },
    { unique: true, partialFilterExpression: { room: { $type: "string" } } }
);
timetableEntrySchema.index({ schoolId: 1, sectionId: 1, dayOfWeek: 1, periodNumber: 1 });

const TimetableEntry = mongoose.models.TimetableEntry
    ?? mongoose.model("TimetableEntry", timetableEntrySchema);
export default TimetableEntry;
