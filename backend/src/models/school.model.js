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
            planId: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan" },
            plan: { type: String, lowercase: true, trim: true, maxlength: 32, default: "trial" },
            status: { type: String, enum: ["trial", "active", "past_due", "canceled"], default: "trial" },
            trialEndsAt: { type: Date },
            currentPeriodEnd: { type: Date },
            limitRevision: { type: Number, default: 0, select: false }
        },
        branches: {
            type: [branchSchema],
            default: () => [{ name: "Main", code: "MAIN", isMain: true }]
        },
        settings: {
            attendanceLateGraceMinutes: { type: Number, min: 0, max: 180, default: 10 },
            attendanceStartTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: "08:00" }
        },
        // One school = one base currency for school-owned financial operations.
        // Platform SaaS billing remains separate and is not controlled by this field.
        baseCurrency: { type: String, uppercase: true, trim: true, match: /^[A-Z]{3}$/ },
        // ISO 4217 minor-unit exponent for the configured base currency. Stored explicitly for auditability.
        baseCurrencyExponent: { type: Number, min: 0, max: 3 },
        currencyConfiguredAt: { type: Date },
        currencyConfiguredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        currencyConfigurationStatus: {
            type: String,
            enum: ["unconfigured", "configured"],
            default: "unconfigured"
        },
        // Metadata only. Image bytes are stored in the durable object store.
        logo: {
            storageKey: { type: String, trim: true, maxlength: 512 },
            storageProvider: { type: String, enum: ["s3", "cloudinary"], default: "s3", trim: true },
            contentType: { type: String, trim: true, maxlength: 64 },
            sizeBytes: { type: Number, min: 1 },
            fileName: { type: String, trim: true, maxlength: 240 },
            checksum: { type: String, trim: true, maxlength: 128 },
            version: { type: Number, min: 1, default: 1 },
            uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            updatedAt: { type: Date }
        }
    },
    { timestamps: true, strict: "throw" }
);

schoolSchema.index({ status: 1, "subscription.trialEndsAt": 1 });
schoolSchema.index({ "subscription.planId": 1, status: 1 });

const School = mongoose.models.School ?? mongoose.model("School", schoolSchema);
export default School;
