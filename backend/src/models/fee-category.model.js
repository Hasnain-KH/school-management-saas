import mongoose from "mongoose";

const feeCategorySchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 100 },
        code: { type: String, required: true, trim: true, uppercase: true, maxlength: 32 },
        description: { type: String, trim: true, maxlength: 300 },
        isActive: { type: Boolean, default: true, required: true }
    },
    { timestamps: true, strict: "throw" }
);

feeCategorySchema.index({ schoolId: 1, code: 1 }, { unique: true });
feeCategorySchema.index({ schoolId: 1, isActive: 1, name: 1 });

const FeeCategory = mongoose.models.FeeCategory ?? mongoose.model("FeeCategory", feeCategorySchema);
export default FeeCategory;
