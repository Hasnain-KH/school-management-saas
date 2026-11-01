import mongoose from "mongoose";

const feePaymentSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, immutable: true, index: true },
        voucherId: { type: mongoose.Schema.Types.ObjectId, ref: "FeeVoucher", required: true, immutable: true },
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
        receiptNumber: { type: String, required: true, trim: true, uppercase: true, immutable: true, maxlength: 64 },
        idempotencyKey: { type: String, required: true, trim: true, immutable: true, maxlength: 100 },
        amountMinor: { type: Number, required: true, min: 1, immutable: true },
        currency: { type: String, required: true, match: /^[A-Z]{3}$/, immutable: true },
        method: { type: String, enum: ["cash", "bank_transfer", "cheque", "other"], required: true, immutable: true },
        reference: { type: String, trim: true, maxlength: 100, immutable: true },
        note: { type: String, trim: true, maxlength: 300, immutable: true },
        receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
        receivedAt: { type: Date, required: true, immutable: true, default: Date.now }
    },
    { timestamps: { createdAt: true, updatedAt: false }, strict: "throw" }
);

feePaymentSchema.index({ schoolId:  1, receiptNumber: 1 }, { unique: true });
feePaymentSchema.index({ schoolId: 1, idempotencyKey: 1 }, { unique: true });
feePaymentSchema.index({ schoolId: 1, voucherId: 1, receivedAt: -1 });
feePaymentSchema.index({ schoolId: 1, studentId: 1, receivedAt: -1 });

const FeePayment = mongoose.models.FeePayment ?? mongoose.model("FeePayment", feePaymentSchema);
export default FeePayment;
