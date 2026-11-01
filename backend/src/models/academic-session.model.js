import mongoose from "mongoose";

const academicSessionSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 80 },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        status: {
            type: String,
            enum: ["upcoming", "active", "completed"],
            default: "upcoming",
            required: true
        }
    },
    { timestamps: true, strict: "throw" }
);

academicSessionSchema.path("endDate").validate(function endDateAfterStart(value) {
    return !this.startDate || value > this.startDate;
}, "Academic session end date must be after its start date");

academicSessionSchema.index({ schoolId: 1, name: 1 }, { unique: true });
academicSessionSchema.index(
    { schoolId: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: "active" } }
);
academicSessionSchema.index({ schoolId: 1, startDate: -1 });

const AcademicSession = mongoose.models.AcademicSession
    ?? mongoose.model("AcademicSession", academicSessionSchema);
export default AcademicSession;
