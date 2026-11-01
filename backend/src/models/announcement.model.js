import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        title: { type: String, required: true, trim: true, maxlength: 160 },
        body: { type: String, required: true, trim: true, maxlength: 5000 },
        audience: {
            type: [String],
            enum: ["school_admin", "principal", "teacher", "parent"],
            required: true,
            validate: [(roles) => roles.length > 0, "At least one audience role is required"]
        },
        publishedAt: { type: Date, required: true, default: Date.now },
        expiresAt: { type: Date },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        isActive: { type: Boolean, default: true, required: true }
    },
    { timestamps: true, strict: "throw" }
);

announcementSchema.index({ schoolId: 1, isActive: 1, publishedAt: -1 });
announcementSchema.index({ schoolId: 1, audience: 1, publishedAt: -1 });

const Announcement = mongoose.models.Announcement
    ?? mongoose.model("Announcement", announcementSchema);
export default Announcement;
