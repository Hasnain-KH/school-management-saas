import { RedisStore } from "rate-limit-redis";
import { createClient } from "redis";
import { HttpError } from "../utils/http-error.js";

const unavailableError = () => new HttpError(503, "Shared rate limiting is temporarily unavailable");

const unavailableStore = () => ({
    init() {},
    async increment() { throw unavailableError(); },
    async decrement() { throw unavailableError(); },
    async resetKey() { throw unavailableError(); }
});

const requireAvailableStore = (store) => ({
    init(options) {
        return store.init(options).catch((error) => {
            console.error("Shared rate-limit store initialization failed", error?.name ?? "Error");
            throw unavailableError();
        });
    },
    async increment(key) {
        try {
            return await store.increment(key);
        } catch {
            throw unavailableError();
        }
    },
    async decrement(key) {
        try {
            return await store.decrement(key);
        } catch {
            throw unavailableError();
        }
    },
    async resetKey(key) {
        try {
            return await store.resetKey(key);
        } catch {
            throw unavailableError();
        }
    }
});

const createRedisTransport = (redisUrl, redisClientFactory) => {
    const client = redisClientFactory({
        url: redisUrl,
        socket: {
            // Bound reconnects so failed Redis operations reach the existing 503 path promptly.
            reconnectStrategy: (retries) => retries < 2 ? 100 : false
        }
    });
    let connecting;
    client.on("error", (error) => {
        console.error("Shared rate-limit store error", error?.name ?? "Error");
    });
    return async (...command) => {
        try {
            if (!client.isReady) {
                connecting ??= client.connect().finally(() => { connecting = undefined; });
                await connecting;
            }
            return await client.sendCommand(command);
        } catch {
            throw unavailableError();
        }
    };
};

export const createRateLimitStore = ({
    redisUrl = process.env.RATE_LIMIT_REDIS_URL,
    nodeEnv = process.env.NODE_ENV,
    redisClientFactory = createClient,
    prefix = "schoolflow:"
} = {}) => {
    if (!redisUrl) {
        if (nodeEnv !== "production") return undefined;
        return unavailableStore();
    }
    return requireAvailableStore(new RedisStore({
        sendCommand: createRedisTransport(redisUrl, redisClientFactory),
        prefix
    }));
};

export const createLimiterStores = ({
    redisUrl,
    nodeEnv = process.env.NODE_ENV,
    redisClientFactory = createClient,
    namespace = ""
} = {}) => {
    const configuredRedisUrl = redisUrl
        ?? (nodeEnv === "test" ? undefined : process.env.RATE_LIMIT_REDIS_URL);
    const sendCommand = configuredRedisUrl
        ? createRedisTransport(configuredRedisUrl, redisClientFactory)
        : undefined;
    const keyPrefix = namespace ? `schoolflow:${namespace}:` : "schoolflow:";
    const createStore = (limiter) => {
        if (!sendCommand) {
            return nodeEnv === "production" ? unavailableStore() : undefined;
        }
        return requireAvailableStore(new RedisStore({
            sendCommand,
            prefix: `${keyPrefix}${limiter}:`
        }));
    };

    return {
        apiStore: createStore("api"),
        authStore: createStore("auth")
    };
};
