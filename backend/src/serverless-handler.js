import app from "./app.js";
import connectDB from "./config/db.js";
import { getConfig } from "./config/env.js";

export default async function handler(req, res) {
    try {
        const { trustProxyHops } = getConfig();
        app.set("trust proxy", trustProxyHops);
        await connectDB();
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
