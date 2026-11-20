import rateLimit from "express-rate-limit";
import { createLimiterStores } from "../services/rate-limit-store.js";

export const createRateLimitMiddlewares = ({ apiLimit = 300, authLimit = 10, ...options } = {}) => {
    const { apiStore, authStore } = createLimiterStores(options);

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
        })
    };
};
