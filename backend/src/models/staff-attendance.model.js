import mongoose from "mongoose";

const staffAttendanceSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        date: { type: Date, required: true },
        status: { type: String, enum: ["present", "absent", "late", "leave"], required: true },
        checkIn: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        checkOut: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        note: { type: String, trim: true, maxlength: 300 },
        markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
    },
    { timestamps: true, strict: "throw" }
);

staffAttendanceSchema.index({ schoolId: 1, userId: 1, date: 1 }, { unique: true });
staffAttendanceSchema.index({ schoolId: 1, date: 1, status: 1 });

const StaffAttendance = mongoose.models.StaffAttendance
    ?? mongoose.model("StaffAttendance", staffAttendanceSchema);
export default StaffAttendance;
