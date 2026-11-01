import mongoose from "mongoose";

const planFeatureSchema = new mongoose.Schema(
    {
        academics: { type: Boolean, default: false },
        students: { type: Boolean, default: false },
        staff: { type: Boolean, default: false },
        attendance: { type: Boolean, default: false },
        fees: { type: Boolean, default: false },
        exams: { type: Boolean, default: false },
        calendar: { type: Boolean, default: false },
        inventory: { type: Boolean, default: false },
        library: { type: Boolean, default: false },
        notifications: { type: Boolean, default: false },
        reports: { type: Boolean, default: false }
    },
    { _id: false, strict: "throw" }
);

const subscriptionPlanSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 100 },
        code: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            maxlength: 32,
            match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
        },
        description: { type: String, trim: true, maxlength: 500 },
        priceMinor: { type: Number, required: true, min: 0, max: Number.MAX_SAFE_INTEGER },
        currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
        billingInterval: { type: String, enum: ["monthly", "annual"], required: true },
        trialDurationDays: { type: Number, min: 1, max: 365, default: null },
        limits: {
            students: { type: Number, min: 1, default: null },
            staff: { type: Number, min: 1, default: null },
            branches: { type: Number, min: 1, default: null }
        },
        features: { type: planFeatureSchema, required: true },
        isActive: { type: Boolean, default: true, required: true },
        isDefaultTrial: { type: Boolean, default: false, required: true }
    },
    { timestamps: true, strict: "throw" }
);

subscriptionPlanSchema.index({ code: 1 }, { unique: true });
subscriptionPlanSchema.index(
    { isDefaultTrial: 1 },
    { unique: true, partialFilterExpression: { isDefaultTrial: true } }
);
subscriptionPlanSchema.index({ isActive: 1, name: 1 });
subscriptionPlanSchema.pre("validate", function validateTrialDuration() {
    if (this.isDefaultTrial && !this.trialDurationDays) {
        this.invalidate("trialDurationDays", "Default trial plans require a trial duration");
    }
});

const SubscriptionPlan = mongoose.models.SubscriptionPlan
    ?? mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
export default SubscriptionPlan;
