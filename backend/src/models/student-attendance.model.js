import mongoose from "mongoose";

const studentAttendanceSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
        academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", required: true },
        sectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true },
        date: { type: Date, required: true },
        status: { type: String, enum: ["present", "absent", "late", "leave"], required: true },
        checkIn: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        checkOut: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        note: { type: String, trim: true, maxlength: 300 },
        markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
    },
    { timestamps: true, strict: "throw" }
);

studentAttendanceSchema.index({ schoolId: 1, studentId: 1, date: 1 }, { unique: true });
studentAttendanceSchema.index({ schoolId: 1, sectionId: 1, date: 1, status: 1 });
studentAttendanceSchema.index({ schoolId: 1, academicSessionId: 1, date: 1 });

const StudentAttendance = mongoose.models.StudentAttendance
    ?? mongoose.model("StudentAttendance", studentAttendanceSchema);
export default StudentAttendance;
