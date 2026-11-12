import mongoose from "mongoose";

// A recorded subscription payment for a school. Manual (offline) payments are
// recorded directly by a platform administrator; gateway payments start as
// "pending" and are marked "paid" only after a verified provider webhook.
const paymentSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
        planId: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", default: null },
        planCode: { type: String, trim: true, lowercase: true, maxlength: 32, default: null },
        amountMinor: { type: Number, required: true, min: 0, max: Number.MAX_SAFE_INTEGER },
        currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
        status: {
            type: String,
            enum: ["pending", "paid", "failed", "refunded"],
            default: "pending",
            required: true
        },
        method: { type: String, enum: ["manual", "gateway"], default: "manual", required: true },
        provider: { type: String, trim: true, maxlength: 40, default: null },
        providerReference: { type: String, trim: true, maxlength: 200, default: null },
        billingInterval: { type: String, trim: true, maxlength: 16, default: null },
        periodStart: { type: Date, default: null },
        periodEnd: { type: Date, default: null },
        notes: { type: String, trim: true, maxlength: 500, default: null },
        recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        paidAt: { type: Date, default: null }
    },
    { timestamps: true, strict: "throw" }
);

paymentSchema.index({ schoolId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index(
    { providerReference: 1 },
    { unique: true, partialFilterExpression: { providerReference: { $type: "string" } } }
);

const Payment = mongoose.models.Payment ?? mongoose.model("Payment", paymentSchema);
export default Payment;
