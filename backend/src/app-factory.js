import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import { createAuthRouter } from "./routes/auth.routes.js";
import attendanceRoutes from "./routes/attendance.routes.js";
import academicRoutes from "./routes/academic.routes.js";
import financeRoutes from "./routes/finance.routes.js";
import examRoutes from "./routes/exam.routes.js";
import operationsRoutes from "./routes/operations.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import jobRoutes from "./routes/job.routes.js";
import documentRoutes from "./routes/document.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import platformRoutes from "./routes/platform.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import fixedAssetRoutes from "./routes/fixed-asset.routes.js";
import parentPortalRoutes from "./routes/parent-portal.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import portalRoutes from "./routes/portal.routes.js";
import teacherPortalRoutes from "./routes/teacher-portal.routes.js";
import healthRoutes from "./routes/health.routes.js";
import schoolRoutes from "./routes/school.routes.js";
import studentRoutes from "./routes/student.routes.js";
import userRoutes from "./routes/user.routes.js";
import { createRateLimitMiddlewares } from "./middleware/rate-limit.middleware.js";
import { csrfProtection } from "./middleware/csrf.middleware.js";
import { getAllowedOrigins } from "./config/env.js";
import { HttpError } from "./utils/http-error.js";
import { errorHandler, notFound } from "./middleware/error.middleware.js";

export const createApp = ({ rateLimitOptions } = {}) => {
    const { apiLimiter, authLimiter } = createRateLimitMiddlewares(rateLimitOptions);
    const authRoutes = createAuthRouter(authLimiter);
    const app = express();

    app.disable("x-powered-by");
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:"],
                fontSrc: ["'self'", "data:"],
                connectSrc: ["'self'", ...getAllowedOrigins()],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                frameAncestors: ["'none'"]
            }
        }
    }));
    app.use(cors({
        origin(origin, callback) {
            if (!origin || getAllowedOrigins().includes(origin)) {
                return callback(null, true);
            }
            return callback(new HttpError(403, "Origin is not allowed by CORS"));
        },
        credentials: true
    }));
    app.use(cookieParser());
    app.use(csrfProtection);
    // Document and logo uploads carry base64 payloads, so they need a larger
    // JSON body limit. Mounting these before the global parser lets them win.
    app.use("/api/v1/documents", express.json({ limit: "8mb" }));
    // A 2 MB logo expands to roughly 2.7 MB of base64.
    app.use("/api/v1/schools/me/logo", express.json({ limit: "3mb" }));
    // Gateway webhooks must be verified against the exact bytes the provider
    // signed, so capture the raw body for that path before the JSON parser.
    app.use("/api/v1/payments/webhook", express.raw({ type: "*/*", limit: "200kb" }));
    app.use(express.json({ limit: "100kb" }));

    app.use("/api/v1", healthRoutes);
    app.use("/api/v1", apiLimiter);
    app.use("/api/v1/auth", authRoutes);
    app.use("/api/v1/platform", platformRoutes);
    app.use("/api/v1/payments", paymentRoutes);
    app.use("/api/v1/portal/parent", parentPortalRoutes);
    app.use("/api/v1/portal", portalRoutes);
    app.use("/api/v1/portal/teacher", teacherPortalRoutes);
    app.use("/api/v1/audit", auditRoutes);
    app.use("/api/v1/attendance", attendanceRoutes);
    app.use("/api/v1/academics", academicRoutes);
    app.use("/api/v1/finance", financeRoutes);
    app.use("/api/v1/exams", examRoutes);
    app.use("/api/v1/operations", operationsRoutes);
    app.use("/api/v1/operations/assets", fixedAssetRoutes);
    app.use("/api/v1/notifications", notificationRoutes);
    app.use("/api/v1/documents", documentRoutes);
    app.use("/api/v1/jobs", jobRoutes);
    app.use("/api/v1/reports", reportsRoutes);
    app.use("/api/v1/users", userRoutes);
    app.use("/api/v1/students", studentRoutes);
    app.use("/api/v1/schools", schoolRoutes);

    app.get("/", (req, res) => {
        res.status(200).json({
            success: true,
            message: "SchoolFlow SaaS API is running!",
            data: null
        });
    });

    app.use(notFound);
    app.use(errorHandler);

    return app;
};
