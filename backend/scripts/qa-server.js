// QA-only server bootstrap. Identical to src/server.js except that the rate
// limiters are forced to their in-memory store so the isolated QA run cannot
// consume or mutate the shared Redis counters. No production code is changed.
import "dotenv/config";
import mongoose from "mongoose";
import { createApp } from "../src/app-factory.js";
import connectDB from "../src/config/db.js";
import { getConfig } from "../src/config/env.js";
import { validateMongoTestUri } from "../src/testing/mongo-test-safety.js";
import { configureEmailDeliveryFromEnv } from "../src/services/email-delivery.provider.js";
import { configureDocumentStorageFromEnv } from "../src/services/document-storage.provider.js";
import { maybeAutoSeedDefaultPlans } from "../src/services/plan-seed.service.js";
import { startDevScheduler } from "../src/services/job-runner.service.js";

// Hard safety gate: never connect this harness to anything but an isolated QA DB.
validateMongoTestUri(process.env.MONGO_URI);
if (!/schoolflow_test_qa/i.test(process.env.MONGO_URI)) {
    throw new Error("QA server may only connect to schoolflow_test_qa");
}

// QA never selects Cloudinary and never contacts a real object store. The
// values below force the loopback mock sink; they are disposable placeholders.
process.env.STORAGE_PROVIDER = "s3";
process.env.STORAGE_ENDPOINT = "http://127.0.0.1:5011";
process.env.STORAGE_BUCKET = "schoolflow-qa";
process.env.STORAGE_ACCESS_KEY_ID = "qa-mock-access-key";
process.env.STORAGE_SECRET_ACCESS_KEY = "qa-mock-secret-key";
delete process.env.CLOUDINARY_CLOUD_NAME;
delete process.env.CLOUDINARY_API_KEY;
delete process.env.CLOUDINARY_API_SECRET;

// A real browser run signs in as five roles plus a responsive re-check; each
// guest page load also probes /auth/refresh once. Keep the production default
// untouched, but give this disposable harness enough headroom to complete.
const app = createApp({ rateLimitOptions: { redisUrl: "", nodeEnv: "development", apiLimit: 5000, authLimit: 1000 } });
const { port, trustProxyHops } = getConfig();
await connectDB();
configureEmailDeliveryFromEnv();
configureDocumentStorageFromEnv();
await maybeAutoSeedDefaultPlans();
startDevScheduler();
if (trustProxyHops > 0) app.set("trust proxy", trustProxyHops);

const server = app.listen(port, () => {
    console.info(`SchoolFlow QA API listening on port ${port} (in-memory rate limiters)`);
});

const shutdown = (signal) => {
    console.info(`${signal} received; closing QA server`);
    server.close(async () => {
        await mongoose.disconnect();
    });
};
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
