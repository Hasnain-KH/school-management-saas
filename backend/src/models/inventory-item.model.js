import mongoose from "mongoose";

const inventoryItemSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
        name: { type: String, required: true, trim: true, maxlength: 120 },
        category: { type: String, required: true, trim: true, maxlength: 80 },
        unit: { type: String, required: true, trim: true, maxlength: 30 },
        quantityOnHand: { type: Number, required: true, min: 0, default: 0 },
        reorderLevel: { type: Number, required: true, min: 0, default: 0 },
        location: { type: String, trim: true, maxlength: 120 },
        isActive: { type: Boolean, default: true, required: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
    },
    { timestamps: true, strict: "throw" }
);

inventoryItemSchema.index({ schoolId: 1, sku: 1 }, { unique: true });
inventoryItemSchema.index({ schoolId: 1, category: 1, isActive: 1 });
inventoryItemSchema.index({ schoolId: 1, quantityOnHand: 1 });

const InventoryItem = mongoose.models.InventoryItem
    ?? mongoose.model("InventoryItem", inventoryItemSchema);
export default InventoryItem;
