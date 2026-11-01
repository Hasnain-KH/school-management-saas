import mongoose from "mongoose";

const libraryBookSchema = new mongoose.Schema(
    {
        schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
        isbn: { type: String, trim: true, uppercase: true, maxlength: 20 },
        title: { type: String, required: true, trim: true, maxlength: 180 },
        author: { type: String, required: true, trim: true, maxlength: 120 },
        subject: { type: String, trim: true, maxlength: 100 },
        copiesTotal: { type: Number, required: true, min: 1, max: 10000 },
        copiesAvailable: { type: Number, required: true, min: 0, max: 10000 },
        isActive: { type: Boolean, default: true, required: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
    },
    { timestamps: true, strict: "throw" }
);

libraryBookSchema.pre("validate", function validateAvailableCopies() {
    if (this.copiesAvailable > this.copiesTotal) {
        this.invalidate("copiesAvailable", "Available copies cannot exceed total copies");
    }
});
libraryBookSchema.index(
    { schoolId: 1, isbn: 1 },
    { unique: true, partialFilterExpression: { isbn: { $type: "string" } } }
);
libraryBookSchema.index({ schoolId: 1, title: 1, author: 1 });
libraryBookSchema.index({ schoolId: 1, copiesAvailable: 1, isActive: 1 });

const LibraryBook = mongoose.models.LibraryBook ?? mongoose.model("LibraryBook", libraryBookSchema);
export default LibraryBook;
