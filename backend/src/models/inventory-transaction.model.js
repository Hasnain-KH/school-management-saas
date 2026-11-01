import mongoose from "mongoose";

const inventoryTransactionSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, immutable: true, index: true },
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem", required: true, immutable: true },
        type: { type: String, enum: ["received", "issued"], required: true, immutable: true },
        quantity: { type: Number, required: true, min: 1, immutable: true },
        reference: { type: String, trim: true, maxlength: 100, immutable: true },
        note: { type: String, trim: true, maxlength: 300, immutable: true },
        actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
        occurredAt: { type: Date, required: true, immutable: true, default: Date.now }
    },
    { timestamps: { createdAt: true, updatedAt: false }, strict: "throw" }
);

inventoryTransactionSchema.index({ schoolId: 1, itemId: 1, occurredAt: -1 });
inventoryTransactionSchema.index({ schoolId: 1, type: 1, occurredAt: -1 });

const InventoryTransaction = mongoose.models.InventoryTransaction
    ?? mongoose.model("InventoryTransaction", inventoryTransactionSchema);
export default InventoryTransaction;
