import express from "express";
import { currentUser, refresh, register, signIn, signOut } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { authLimiter } from "../middleware/rate-limit.middleware.js";
import { loginSchema, refreshSchema, schoolRegistrationSchema } from "../validators/auth.validator.js";
import { validate } from "../validators/common.validator.js";

const router = express.Router();

router.post("/register", authLimiter, validate(schoolRegistrationSchema), register);
router.post("/login", authLimiter, validate(loginSchema), signIn);
router.post("/refresh", authLimiter, validate(refreshSchema), refresh);
router.post("/logout", requireAuth, validate(refreshSchema), signOut);
router.get("/me", requireAuth, currentUser);

export default router;
