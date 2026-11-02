import express from "express";
import {
    currentUser,
    csrfToken,
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
import {
    emailVerificationSchema,
    emailVerificationRequestSchema,
    loginSchema,
    passwordRecoverySchema,
    passwordResetSchema,
    schoolRegistrationSchema
} from "../validators/auth.validator.js";
import { validate } from "../validators/common.validator.js";

export const createAuthRouter = (authLimiter) => {
    const router = express.Router();

    router.get("/csrf", csrfToken);
    router.post("/register", authLimiter, validate(schoolRegistrationSchema), register);
    router.post("/login", authLimiter, validate(loginSchema), signIn);
    router.post("/refresh", authLimiter, refresh);
    router.post("/logout", signOut);
    router.post("/password-recovery", authLimiter, validate(passwordRecoverySchema), requestPasswordReset);
    router.post("/password-reset", authLimiter, validate(passwordResetSchema), resetPassword);
    router.post("/email-verification", authLimiter, validate(emailVerificationRequestSchema), requestVerification);
    router.post("/email-verification/confirm", authLimiter, validate(emailVerificationSchema), verifyEmail);
    router.get("/me", requireAuth, currentUser);

    return router;
};
