import mongoose from "mongoose";

const accountActionTokenSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", default: null, immutable: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
        type: { type: String, enum: ["password_reset", "email_verification"], required: true, immutable: true },
        tokenHash: { type: String, required: true, unique: true, select: false, immutable: true },
        expiresAt: { type: Date, required: true, immutable: true },
        consumedAt: { type: Date, default: null }
    },
    { timestamps: { createdAt: true, updatedAt: false }, strict: "throw" }
);

accountActionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
accountActionTokenSchema.index({ schoolId: 1, userId: 1, type: 1, consumedAt: 1 });

const AccountActionToken = mongoose.models.AccountActionToken
    ?? mongoose.model("AccountActionToken", accountActionTokenSchema);
export default AccountActionToken;
