import mongoose from "mongoose";
import app from "./app.js";
import connectDB from "./config/db.js";
import { getConfig } from "./config/env.js";

const startServer = async () => {
    const { port, trustProxyHops } = getConfig();
    await connectDB();

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
                console.error("HTTP server shutdown failed", error.name);
                process.exitCode = 1;
            }
        });
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    return server;
};

startServer().catch((error) => {
    console.error("SchoolFlow API startup failed", error.name ?? "Error");
    process.exitCode = 1;
});