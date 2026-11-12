import app from "./app.js";
import connectDB from "./config/db.js";
import { getConfig } from "./config/env.js";
import { configureEmailDeliveryFromEnv } from "./services/email-delivery.provider.js";
import { configureDocumentStorageFromEnv } from "./services/document-storage.provider.js";
import { maybeAutoSeedDefaultPlans } from "./services/plan-seed.service.js";

// Provider configuration and plan seeding only need to happen once per warm
// serverless instance, not on every request.
let initialized = false;

const initialize = async () => {
    if (initialized) return;
    configureEmailDeliveryFromEnv();
    configureDocumentStorageFromEnv();
    await maybeAutoSeedDefaultPlans();
    initialized = true;
};

export default async function handler(req, res) {
    try {
        const { trustProxyHops } = getConfig();
        app.set("trust proxy", trustProxyHops);
        await connectDB();
        await initialize();
        return app(req, res);
    } catch (error) {
        console.error("SchoolFlow serverless request failed", {
            name: error?.name ?? "Error",
            code: error?.code
        });
        if (res.headersSent) return;
        return res.status(503).json({
            success: false,
            message: "The service is temporarily unavailable"
        });
    }
}
