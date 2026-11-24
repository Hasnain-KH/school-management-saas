import app from "./app.js";
import connectDB from "./config/db.js";
import { getConfig } from "./config/env.js";
import { configureEmailDeliveryFromEnv } from "./services/email-delivery.provider.js";
import { configureDocumentStorageFromEnv } from "./services/document-storage.provider.js";
import { maybeAutoSeedDefaultPlans } from "./services/plan-seed.service.js";

// Provider configuration and plan seeding happen once per warm instance. A
// module-scope promise (rather than a boolean) prevents concurrent cold
// invocations from configuring providers twice or racing each other.
let initializationPromise;

const initialize = () => {
    if (!initializationPromise) {
        initializationPromise = (async () => {
            configureEmailDeliveryFromEnv();
            configureDocumentStorageFromEnv();
            await maybeAutoSeedDefaultPlans();
        })().catch((error) => {
            // Allow the next invocation to retry instead of stranding a warm
            // instance in a permanently half-initialized state.
            initializationPromise = undefined;
            throw error;
        });
    }
    return initializationPromise;
};

const dispatch = (req, res) => new Promise((resolve, reject) => {
    const done = () => resolve();
    res.once("finish", done);
    res.once("close", done);
    res.once("error", reject);
    app(req, res);
});

export default async function handler(req, res) {
    try {
        const { trustProxyHops } = getConfig();
        app.set("trust proxy", trustProxyHops);
        await connectDB();
        await initialize();
        return await dispatch(req, res);
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
