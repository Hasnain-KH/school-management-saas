import mongoose from "mongoose";

const voucherLineSchema = new mongoose.Schema(
    {
        categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "FeeCategory", required: true },
        name: { type: String, required: true, trim: true, maxlength: 100 },
        amountMinor: { type: Number, required: true, min: 1 }
    },
    { _id: false, strict: "throw" }
);

const feeVoucherSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
        classId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicClass", required: true },
        feeAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentFeeAssignment", required: true },
        feeStructureId: { type: mongoose.Schema.Types.ObjectId, ref: "FeeStructure", required: true },
        period: { type: String, required: true, match: /^\d{4}(?:-(0[1-9]|1[0-2]))?$/ },
        dueDate: { type: Date, required: true },
        currency: { type: String, uppercase: true, match: /^[A-Z]{3}$/, required: true },
        lineItems: { type: [voucherLineSchema], required: true },
        grossAmountMinor: { type: Number, required: true, min: 1 },
        discountAmountMinor: { type: Number, required: true, min: 0 },
        scholarshipName: { type: String, trim: true, maxlength: 120 },
        amountDueMinor: { type: Number, required: true, min: 1 },
        paidAmountMinor: { type: Number, required: true, min: 0, default: 0 },
        balanceMinor: { type: Number, required: true, min: 0 },
        status: { type: String, enum: ["unpaid", "partial", "paid"], required: true, default: "unpaid" }
    },
    { timestamps: true, strict: "throw" }
);

feeVoucherSchema.pre("validate", function validateVoucherTotals() {
    const gross = this.lineItems.reduce((sum, item) => sum + item.amountMinor, 0);
    if (this.grossAmountMinor !== gross) {
        this.invalidate("grossAmountMinor", "Gross amount must equal the fee line-item total");
    }
    if (this.amountDueMinor !== this.grossAmountMinor - this.discountAmountMinor) {
        this.invalidate("amountDueMinor", "Amount due must equal gross amount minus discount");
    }
    if (this.balanceMinor !== this.amountDueMinor - this.paidAmountMinor) {
        this.invalidate("balanceMinor", "Balance must equal amount due minus payments");
    }
    const expectedStatus = this.balanceMinor === 0
        ? "paid"
        : this.paidAmountMinor > 0 ? "partial" : "unpaid";
    if (this.status !== expectedStatus) {
        this.invalidate("status", "Voucher status must match the paid and outstanding amounts");
    }
});

feeVoucherSchema.index({ schoolId: 1, feeAssignmentId: 1, period: 1 }, { unique: true });
feeVoucherSchema.index({ schoolId: 1, studentId: 1, period: 1 });
feeVoucherSchema.index({ schoolId: 1, classId: 1, dueDate: 1, balanceMinor: 1 });
feeVoucherSchema.index({ schoolId: 1, status: 1, dueDate: 1 });

const FeeVoucher = mongoose.models.FeeVoucher ?? mongoose.model("FeeVoucher", feeVoucherSchema);
export default FeeVoucher;
