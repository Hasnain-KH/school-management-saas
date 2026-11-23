import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        type: {
            type: String,
            enum: ["attendance", "fee", "payment", "result", "homework", "announcement", "leave", "general", "media", "consent"],
            required: true
        },
        title: { type: String, required: true, trim: true, maxlength: 160 },
        body: { type: String, required: true, trim: true, maxlength: 2000 },
        data: { type: mongoose.Schema.Types.Mixed, default: {} },
        readAt: { type: Date, default: null },
        dedupeKey: { type: String, trim: true, maxlength: 200, default: null }
    },
    { timestamps: true, strict: "throw" }
);

notificationSchema.index({ schoolId: 1, userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index(
    { schoolId: 1, userId: 1, dedupeKey: 1 },
    { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }
);

const Notification = mongoose.models.Notification
    ?? mongoose.model("Notification", notificationSchema);
export default Notification;
