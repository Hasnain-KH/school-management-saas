import mongoose from "mongoose";

const fixedAssetAssignmentSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, immutable: true, index: true },
        assetId: { type: mongoose.Schema.Types.ObjectId, ref: "FixedAsset", required: true, immutable: true },
        action: { type: String, enum: ["assigned", "released"], required: true, immutable: true },
        assigneeType: { type: String, enum: ["user", "student"], required: true, immutable: true },
        assigneeId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
        note: { type: String, trim: true, maxlength: 300, immutable: true },
        actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
        occurredAt: { type: Date, required: true, default: Date.now, immutable: true }
    },
    { timestamps: { createdAt: true, updatedAt: false }, strict: "throw" }
);

fixedAssetAssignmentSchema.index({ schoolId: 1, assetId: 1, occurredAt: -1 });
fixedAssetAssignmentSchema.index({ schoolId: 1, assigneeType: 1, assigneeId: 1, occurredAt: -1 });

const FixedAssetAssignment = mongoose.models.FixedAssetAssignment
    ?? mongoose.model("FixedAssetAssignment", fixedAssetAssignmentSchema);
export default FixedAssetAssignment;
