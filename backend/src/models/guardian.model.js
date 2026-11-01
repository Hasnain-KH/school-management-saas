import mongoose from "mongoose";

const guardianSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 120 },
        email: { type: String, lowercase: true, trim: true, maxlength: 254 },
        phone: { type: String, required: true, trim: true, maxlength: 30 },
        relationship: {
            type: String,
            enum: ["mother", "father", "guardian", "grandparent", "other"],
            default: "guardian",
            required: true
        },
        address: { type: String, trim: true, maxlength: 240 },
        isActive: { type: Boolean, default: true, required: true }
    },
    { timestamps: true, strict: "throw" }
);

guardianSchema.index({ schoolId: 1, phone: 1, name: 1 });
guardianSchema.index({ schoolId: 1, email: 1 });

const Guardian = mongoose.models.Guardian ?? mongoose.model("Guardian", guardianSchema);
export default Guardian;
