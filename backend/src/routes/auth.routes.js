import express from "express";
import {
    currentUser,
    refresh,
    register,
    requestPasswordReset,
    requestVerification,
    resetPassword,
    signIn,
    signOut,
    verifyEmail
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { authLimiter } from "../middleware/rate-limit.middleware.js";
import {
    emailVerificationSchema,
    emailVerificationRequestSchema,
    loginSchema,
    passwordRecoverySchema,
    passwordResetSchema,
    refreshSchema,
    schoolRegistrationSchema
} from "../validators/auth.validator.js";
import { validate } from "../validators/common.validator.js";

const router = express.Router();

router.post("/register", authLimiter, validate(schoolRegistrationSchema), register);
router.post("/login", authLimiter, validate(loginSchema), signIn);
router.post("/refresh", authLimiter, validate(refreshSchema), refresh);
router.post("/logout", requireAuth, validate(refreshSchema), signOut);
router.post("/password-recovery", authLimiter, validate(passwordRecoverySchema), requestPasswordReset);
router.post("/password-reset", authLimiter, validate(passwordResetSchema), resetPassword);
router.post("/email-verification", authLimiter, validate(emailVerificationRequestSchema), requestVerification);
router.post("/email-verification/confirm", authLimiter, validate(emailVerificationSchema), verifyEmail);
router.get("/me", requireAuth, currentUser);

export default router;
