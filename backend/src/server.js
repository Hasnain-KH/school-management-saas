import mongoose from "mongoose";
import app from "./app.js";
import connectDB from "./config/db.js";
import { getConfig } from "./config/env.js";
import { configureEmailDeliveryFromEnv } from "./services/email-delivery.provider.js";
import { configureDocumentStorageFromEnv } from "./services/document-storage.provider.js";
import { maybeAutoSeedDefaultPlans } from "./services/plan-seed.service.js";
import { startDevScheduler } from "./services/job-runner.service.js";

// Redacts credentials and secret values so startup diagnostics never leak a
// connection string, token, or key into the logs.
const redactSecrets = (value) => String(value ?? "")
    .replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, "mongodb://<redacted>")
    .replace(
        /((?:[A-Z][A-Z0-9_]*(?:SECRET|KEY|TOKEN|PASSWORD|URI|URL))\s*[:=]\s*)\S+/g,
        "$1<redacted>"
    );

const startServer = async () => {
    const { port, trustProxyHops } = getConfig();
    await connectDB();
    configureEmailDeliveryFromEnv();
    configureDocumentStorageFromEnv();
    await maybeAutoSeedDefaultPlans();
    startDevScheduler();

    if (trustProxyHops > 0) {
        app.set("trust proxy", trustProxyHops);
    }

    const server = app.listen(port, () => {
        console.info(`SchoolFlow API listening on port ${port}`);
    });

    const shutdown = (signal) => {
        console.info(`${signal} received; closing server`);
        server.close(async (error) => {
            await mongoose.disconnect();
            if (error) {
                console.error("HTTP server shutdown failed", redactSecrets(error?.message ?? error?.name ?? "Error"));
                process.exitCode = 1;
            }
        });
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    return server;
};

startServer().catch((error) => {
    console.error(`SchoolFlow API startup failed: ${redactSecrets(error?.message ?? error?.name ?? "Error")}`);
    // The stack is most useful while developing; keep production logs concise.
    if (error?.stack && process.env.NODE_ENV !== "production") {
        console.error(redactSecrets(error.stack));
    }
    // Exit immediately instead of leaving the process parked on open handles
    // (such as the rate-limit Redis client) after a fatal startup error.
    process.exit(1);
});