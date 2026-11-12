import "dotenv/config";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import { seedDefaultSubscriptionPlans } from "../src/services/plan-seed.service.js";

const run = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is required");
    }
    await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
    const result = await seedDefaultSubscriptionPlans();
    console.info(`Subscription plans seeded. Created: ${result.created.join(", ") || "none"}`);
    console.info(`Existing plans preserved: ${result.skipped.join(", ") || "none"}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        await run();
    } catch (error) {
        console.error("Subscription plan seeding failed", error.name ?? "Error");
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}
