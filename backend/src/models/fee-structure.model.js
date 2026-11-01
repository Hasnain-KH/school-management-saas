import mongoose from "mongoose";

const feeLineItemSchema = new mongoose.Schema(
    {
        categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "FeeCategory", required: true },
        name: { type: String, required: true, trim: true, maxlength: 100 },
        amountMinor: { type: Number, required: true, min: 1, max: 100000000 }
    },
    { _id: false, strict: "throw" }
);

const feeStructureSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        academicSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", required: true },
        classId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicClass", required: true },
        name: { type: String, required: true, trim: true, maxlength: 120 },
        code: { type: String, required: true, trim: true, uppercase: true, maxlength: 32 },
        frequency: { type: String, enum: ["monthly", "annual"], required: true },
        dueDay: { type: Number, min: 1, max: 28, default: 10, required: true },
        dueMonth: { type: Number, min: 1, max: 12 },
        currency: { type: String, uppercase: true, match: /^[A-Z]{3}$/, required: true },
        lineItems: { type: [feeLineItemSchema], validate: [(items) => items.length > 0, "At least one fee item is required"] },
        isActive: { type: Boolean, default: true, required: true }
    },
    { timestamps: true, strict: "throw" }
);

feeStructureSchema.pre("validate", function requireAnnualDueMonth() {
    if (this.frequency === "annual" && !this.dueMonth) {
        this.invalidate("dueMonth", "Annual fee structures require a due month");
    }
});

feeStructureSchema.index({ schoolId: 1, academicSessionId: 1, classId: 1, code: 1 }, { unique: true });
feeStructureSchema.index({ schoolId: 1, academicSessionId: 1, classId: 1, isActive: 1 });

const FeeStructure = mongoose.models.FeeStructure ?? mongoose.model("FeeStructure", feeStructureSchema);
export default FeeStructure;
