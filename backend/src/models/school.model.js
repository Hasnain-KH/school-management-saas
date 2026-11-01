import mongoose from "mongoose";

const branchSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 100 },
        code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
        isMain: { type: Boolean, default: false }
    },
    { timestamps: true }
);

const schoolSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 120 },
        slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
        email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
        phone: { type: String, trim: true, maxlength: 30 },
        address: {
            line1: { type: String, trim: true, maxlength: 160 },
            city: { type: String, trim: true, maxlength: 100 },
            region: { type: String, trim: true, maxlength: 100 },
            country: { type: String, trim: true, maxlength: 100 },
            postalCode: { type: String, trim: true, maxlength: 20 }
        },
        status: {
            type: String,
            enum: ["trial", "active", "suspended", "expired"],
            default: "trial",
            required: true
        },
        subscription: {
            plan: { type: String, enum: ["trial", "starter", "professional", "enterprise"], default: "trial" },
            status: { type: String, enum: ["trial", "active", "past_due", "canceled"], default: "trial" },
            trialEndsAt: { type: Date },
            currentPeriodEnd: { type: Date }
        },
        branches: {
            type: [branchSchema],
            default: () => [{ name: "Main", code: "MAIN", isMain: true }]
        },
        settings: {
            attendanceLateGraceMinutes: { type: Number, min: 0, max: 180, default: 10 },
            attendanceStartTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: "08:00" }
        }
    },
    { timestamps: true, strict: "throw" }
);

schoolSchema.index({ status: 1, "subscription.trialEndsAt": 1 });

const School = mongoose.models.School ?? mongoose.model("School", schoolSchema);
export default School;
