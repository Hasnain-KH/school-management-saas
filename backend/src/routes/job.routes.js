import express from "express";
import * as controller from "../controllers/job.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/authorization.middleware.js";

const router = express.Router();

// Scheduler trigger: authenticated by a shared secret, not a user session.
router.post("/run", controller.requireJobSecretMiddleware, controller.runJobs);

// Introspection for the platform owner.
router.get("/", requireAuth, requirePermission("platform:manage"), controller.listJobs);

export default router;
