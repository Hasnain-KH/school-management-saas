import mongoose from "mongoose";

const calendarEventSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        title: { type: String, required: true, trim: true, maxlength: 140 },
        description: { type: String, trim: true, maxlength: 1000 },
        type: { type: String, enum: ["holiday", "event", "meeting", "exam"], required: true },
        startsAt: { type: Date, required: true },
        endsAt: { type: Date, required: true },
        branchId: { type: mongoose.Schema.Types.ObjectId },
        audience: {
            type: [String],
            enum: ["school_admin", "principal", "teacher", "parent"],
            default: ["school_admin", "principal", "teacher", "parent"]
        },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        isActive: { type: Boolean, default: true, required: true }
    },
    { timestamps: true, strict: "throw" }
);

calendarEventSchema.index({ schoolId: 1, startsAt: 1, endsAt: 1, isActive: 1 });
calendarEventSchema.index({ schoolId: 1, branchId: 1, startsAt: 1 });

const CalendarEvent = mongoose.models.CalendarEvent
    ?? mongoose.model("CalendarEvent", calendarEventSchema);
export default CalendarEvent;
