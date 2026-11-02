import mongoose from "mongoose";

const feeReminderDeliverySchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, immutable: true },
        voucherId: { type: mongoose.Schema.Types.ObjectId, ref: "FeeVoucher", required: true, immutable: true },
        guardianId: { type: mongoose.Schema.Types.ObjectId, ref: "Guardian", required: true, immutable: true },
        reminderDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, immutable: true },
        status: { type: String, enum: ["pending", "sent", "failed"], default: "pending", required: true },
        attempts: { type: Number, min: 1, default: 1, required: true },
        lastAttemptAt: { type: Date, required: true, default: Date.now },
        leaseExpiresAt: { type: Date },
        sentAt: { type: Date },
        lastErrorCode: { type: String, maxlength: 60 }
    },
    { timestamps: true, strict: "throw" }
);

feeReminderDeliverySchema.index(
    { schoolId: 1, voucherId: 1, guardianId: 1, reminderDate: 1 },
    { unique: true }
);
feeReminderDeliverySchema.index({ schoolId: 1, reminderDate: 1, status: 1 });

const FeeReminderDelivery = mongoose.models.FeeReminderDelivery
    ?? mongoose.model("FeeReminderDelivery", feeReminderDeliverySchema);
export default FeeReminderDelivery;
