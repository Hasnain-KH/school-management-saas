import mongoose from "mongoose";

const fixedAssetDepreciationSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, immutable: true, index: true },
        assetId: { type: mongoose.Schema.Types.ObjectId, ref: "FixedAsset", required: true, immutable: true },
        period: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/, immutable: true },
        amountMinor: { type: Number, required: true, min: 0, immutable: true },
        accumulatedMinor: { type: Number, required: true, min: 0, immutable: true },
        actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
        recordedAt: { type: Date, required: true, default: Date.now, immutable: true }
    },
    { timestamps: { createdAt: true, updatedAt: false }, strict: "throw" }
);

fixedAssetDepreciationSchema.index({ schoolId: 1, assetId: 1, period: 1 }, { unique: true });
fixedAssetDepreciationSchema.index({ schoolId: 1, period: 1 });

const FixedAssetDepreciation = mongoose.models.FixedAssetDepreciation
    ?? mongoose.model("FixedAssetDepreciation", fixedAssetDepreciationSchema);
export default FixedAssetDepreciation;
