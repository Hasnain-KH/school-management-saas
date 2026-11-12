import express from "express";
import * as controller from "../controllers/payment.controller.js";

const router = express.Router();

// Gateway webhooks are authenticated by the provider's signature, not a session.
router.post("/webhook", controller.webhook);

export default router;
