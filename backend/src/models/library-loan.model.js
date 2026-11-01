import mongoose from "mongoose";

const libraryLoanSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        bookId: { type: mongoose.Schema.Types.ObjectId, ref: "LibraryBook", required: true },
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
        issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        checkedOutAt: { type: Date, required: true, default: Date.now },
        dueAt: { type: Date, required: true },
        returnedAt: { type: Date },
        returnedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        status: { type: String, enum: ["checked_out", "returned"], default: "checked_out", required: true },
        note: { type: String, trim: true, maxlength: 300 }
    },
    { timestamps: true, strict: "throw" }
);

libraryLoanSchema.index(
    { schoolId: 1, bookId: 1, studentId: 1 },
    { unique: true, partialFilterExpression: { status: "checked_out" } }
);
libraryLoanSchema.index({ schoolId: 1, studentId: 1, status: 1, dueAt: 1 });
libraryLoanSchema.index({ schoolId: 1, status: 1, dueAt: 1 });

const LibraryLoan = mongoose.models.LibraryLoan ?? mongoose.model("LibraryLoan", libraryLoanSchema);
export default LibraryLoan;
