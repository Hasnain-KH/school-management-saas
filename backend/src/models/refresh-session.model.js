import mongoose from "mongoose";

const refreshSessionSchema = new mongoose.Schema(
    {
        tokenId: { type: String, required: true, unique: true },
        accessTokenId: { type: String, required: true, unique: true },
        tokenHash: { type: String, required: true, select: false },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
        expiresAt: { type: Date, required: true },
        revokedAt: { type: Date, default: null }
    },
    { timestamps: true, strict: "throw" }
);

refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshSessionSchema.index({ userId: 1, revokedAt: 1 });

const RefreshSession = mongoose.models.RefreshSession
    ?? mongoose.model("RefreshSession", refreshSessionSchema);
export default RefreshSession;
