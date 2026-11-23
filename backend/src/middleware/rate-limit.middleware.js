import rateLimit from "express-rate-limit";
import { createLimiterStores } from "../services/rate-limit-store.js";

export const createRateLimitMiddlewares = ({ apiLimit = 300, authLimit = 10, ...options } = {}) => {
    const { apiStore, authStore, uploadStore, reviewStore } = createLimiterStores(options);

    return {
        apiLimiter: rateLimit({
            windowMs: 15 * 60 * 1000,
            limit: apiLimit,
            standardHeaders: "draft-8",
            legacyHeaders: false,
            store: apiStore
        }),
        authLimiter: rateLimit({
            windowMs: 15 * 60 * 1000,
            limit: authLimit,
            standardHeaders: "draft-8",
            legacyHeaders: false,
            store: authStore,
            message: {
                success: false,
                message: "Too many authentication attempts; try again later"
            }
        }),
        uploadLimiter: rateLimit({
            windowMs: 15 * 60 * 1000,
            limit: 20,
            standardHeaders: "draft-8",
            legacyHeaders: false,
            store: uploadStore,
            message: { message: "Too many upload attempts. Please try again later." }
        }),
        reviewLimiter: rateLimit({
            windowMs: 15 * 60 * 1000,
            limit: 60,
            standardHeaders: "draft-8",
            legacyHeaders: false,
            store: reviewStore,
            message: { message: "Too many review actions. Please try again later." }
        })
    };
};
