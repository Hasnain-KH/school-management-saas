import mongoose from "mongoose";

const studentFeeAssignmentSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
        feeStructureId: { type: mongoose.Schema.Types.ObjectId, ref: "FeeStructure", required: true },
        discountAmountMinor: { type: Number, min: 0, max: 100000000, default: 0, required: true },
        discountBasisPoints: { type: Number, min: 0, max: 10000, default: 0, required: true },
        scholarshipName: { type: String, trim: true, maxlength: 120 },
        startPeriod: { type: String, required: true, match: /^\d{4}(?:-(0[1-9]|1[0-2]))?$/ },
        endPeriod: { type: String, match: /^\d{4}(?:-(0[1-9]|1[0-2]))?$/ },
        isActive: { type: Boolean, default: true, required: true },
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
    },
    { timestamps: true, strict: "throw" }
);

studentFeeAssignmentSchema.pre("validate", function validateDiscountAndPeriod() {
    if (this.discountAmountMinor > 0 && this.discountBasisPoints > 0) {
        this.invalidate("discountBasisPoints", "Use either a fixed discount or a percentage discount");
    }
    if (this.endPeriod && this.endPeriod < this.startPeriod) {
        this.invalidate("endPeriod", "End period must not precede start period");
    }
});

studentFeeAssignmentSchema.index({ schoolId: 1, studentId: 1, feeStructureId: 1 }, { unique: true });
studentFeeAssignmentSchema.index({ schoolId: 1, feeStructureId: 1, isActive: 1 });

const StudentFeeAssignment = mongoose.models.StudentFeeAssignment
    ?? mongoose.model("StudentFeeAssignment", studentFeeAssignmentSchema);
export default StudentFeeAssignment;
