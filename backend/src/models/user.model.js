import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        schoolId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "School",
            required() {
                return this.role !== "platform_super_admin";
            }
        },
        name: { type: String, required: true, trim: true, maxlength: 120 },
        email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
        phone: { type: String, trim: true, maxlength: 30 },
        jobTitle: { type: String, trim: true, maxlength: 80 },
        emailVerifiedAt: { type: Date },
        passwordHash: { type: String, required: true, select: false },
        role: {
            type: String,
            enum: ["platform_super_admin", "school_admin", "principal", "teacher", "parent"],
            required: true
        },
        status: { type: String, enum: ["active", "disabled"], default: "active", required: true }
    },
    {
        timestamps: true,
        strict: "throw",
        toJSON: {
            transform(document, result) {
                delete result.passwordHash;
                delete result.__v;
                return result;
            }
        },
        toObject: {
            transform(document, result) {
                delete result.passwordHash;
                delete result.__v;
                return result;
            }
        }
    }
);

userSchema.index(
    { schoolId: 1, email: 1 },
    { unique: true, partialFilterExpression: { schoolId: { $exists: true } } }
);
userSchema.index(
    { email: 1 },
    { unique: true, partialFilterExpression: { role: "platform_super_admin" } }
);

userSchema.pre("save", async function hashPassword() {
    if (this.isModified("passwordHash")) {
        this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
    }
});

userSchema.methods.verifyPassword = function verifyPassword(password) {
    return bcrypt.compare(password, this.passwordHash);
};

const User = mongoose.models.User ?? mongoose.model("User", userSchema);
export default User;
