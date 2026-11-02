import "dotenv/config";

const durationPattern = /^([1-9]\d*)(s|m|h|d)$/;

export const durationInSeconds = (value, variableName) => {
    const match = durationPattern.exec(value);

    if (!match) {
        throw new Error(`${variableName} must use a duration such as 15m or 7d`);
    }

    const units = { s: 1, m: 60, h: 3600, d: 86400 };
    const seconds = Number(match[1]) * units[match[2]];
    if (!Number.isSafeInteger(seconds) || seconds > 365 * 24 * 60 * 60) {
        throw new Error(`${variableName} must not exceed 365 days`);
    }
    return seconds;
};

export const getAllowedOrigins = () =>
    process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
        : process.env.NODE_ENV === "production"
            ? []
            : ["http://localhost:3000", "http://localhost:5173"];

export const getConfig = () => {
    const nodeEnv = process.env.NODE_ENV;
    if (!["development", "test", "production"].includes(nodeEnv)) {
        throw new Error("NODE_ENV must be set to development, test, or production");
    }

    const port = Number(process.env.PORT ?? 5000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("PORT must be an integer between 1 and 65535");
    }

    const accessSecret = process.env.JWT_ACCESS_SECRET;
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!accessSecret || accessSecret.length < 32) {
        throw new Error("JWT_ACCESS_SECRET must contain at least 32 characters");
    }
    if (!refreshSecret || refreshSecret.length < 32) {
        throw new Error("JWT_REFRESH_SECRET must contain at least 32 characters");
    }
    if (accessSecret === refreshSecret) {
        throw new Error("JWT access and refresh secrets must be different");
    }

    const accessTokenTtl = process.env.ACCESS_TOKEN_TTL ?? "15m";
    const refreshTokenTtl = process.env.REFRESH_TOKEN_TTL ?? "7d";
    const accessTokenTtlSeconds = durationInSeconds(accessTokenTtl, "ACCESS_TOKEN_TTL");
    const refreshTokenTtlSeconds = durationInSeconds(refreshTokenTtl, "REFRESH_TOKEN_TTL");

    const allowedOrigins = getAllowedOrigins();

    if (nodeEnv === "production" && allowedOrigins.length === 0) {
        throw new Error("CORS_ORIGINS must be configured in production");
    }
    if (nodeEnv === "production" && !process.env.RATE_LIMIT_REDIS_URL) {
        throw new Error("RATE_LIMIT_REDIS_URL is required in production");
    }

    const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
    if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
        throw new Error("TRUST_PROXY_HOPS must be a non-negative integer");
    }

    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is required");
    }

    return {
        port,
        mongoUri: process.env.MONGO_URI,
        accessSecret,
        refreshSecret,
        accessTokenTtl,
        refreshTokenTtl,
        accessTokenTtlSeconds,
        refreshTokenTtlSeconds,
        rateLimitRedisUrl: process.env.RATE_LIMIT_REDIS_URL,
        allowedOrigins,
        trustProxyHops,
        nodeEnv
    };
};
