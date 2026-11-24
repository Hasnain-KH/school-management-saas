import mongoose from "mongoose";

// Platform-level receiving details for MANUAL school subscriptions.
// This collection deliberately has no schoolId: it is owned by the platform,
// readable only by school owners through a dedicated public projection, and
// must never contain login credentials (passwords, PINs, OTPs, CVVs).
const platformReceivingAccountSchema = new mongoose.Schema(
    {
        accountType: {
            type: String,
            required: true,
            enum: ["bank_account", "jazzcash", "easypaisa", "other"]
        },
        providerName: { type: String, required: true, trim: true, maxlength: 100 },
        accountTitle: { type: String, required: true, trim: true, maxlength: 150 },
        accountNumber: { type: String, required: true, trim: true, maxlength: 100 },
        iban: { type: String, trim: true, uppercase: true, maxlength: 50, default: null },
        mobileWalletNumber: { type: String, trim: true, maxlength: 50, default: null },
        instructions: { type: String, trim: true, maxlength: 1000, default: null },
        isActive: { type: Boolean, required: true, default: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
    },
    { timestamps: true, strict: "throw" }
);

platformReceivingAccountSchema.index({ isActive: 1, accountType: 1, createdAt: -1 });

const PlatformReceivingAccount = mongoose.models.PlatformReceivingAccount
    ?? mongoose.model("PlatformReceivingAccount", platformReceivingAccountSchema);
export default PlatformReceivingAccount;
