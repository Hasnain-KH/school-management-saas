import mongoose from "mongoose";

const fixedAssetSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, immutable: true },
        assetTag: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
        name: { type: String, required: true, trim: true, maxlength: 140 },
        category: { type: String, required: true, trim: true, maxlength: 80 },
        acquisitionDate: { type: Date, required: true },
        costMinor: { type: Number, required: true, min: 1 },
        salvageValueMinor: { type: Number, required: true, min: 0 },
        currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
        usefulLifeMonths: { type: Number, required: true, min: 1, max: 1200 },
        depreciationMethod: { type: String, enum: ["straight_line"], default: "straight_line", required: true },
        location: { type: String, trim: true, maxlength: 120 },
        assignmentRevision: { type: Number, default: 0, select: false },
        status: { type: String, enum: ["active", "disposed"], default: "active", required: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true }
    },
    { timestamps: true, strict: "throw" }
);

fixedAssetSchema.pre("validate", function validateAssetValues() {
    if (this.salvageValueMinor >= this.costMinor) {
        this.invalidate("salvageValueMinor", "Salvage value must be less than acquisition cost");
    }
});

fixedAssetSchema.index({ schoolId: 1, assetTag: 1 }, { unique: true });
fixedAssetSchema.index({ schoolId: 1, status: 1, category: 1 });

const FixedAsset = mongoose.models.FixedAsset ?? mongoose.model("FixedAsset", fixedAssetSchema);
export default FixedAsset;
