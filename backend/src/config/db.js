import mongoose from "mongoose";
import { getConfig } from "./env.js";

const CONNECTION_PROMISE_KEY = "__schoolflowMongoConnectionPromise";

const connectDB = async () => {
    if (mongoose.connection.readyState === 1) return mongoose.connection;
    const { mongoUri } = getConfig();
    let connectionPromise = globalThis[CONNECTION_PROMISE_KEY];
    if (!connectionPromise) {
        connectionPromise = mongoose.connect(mongoUri, {
            autoIndex: process.env.NODE_ENV !== "production",
            serverSelectionTimeoutMS: 10000
        });
        globalThis[CONNECTION_PROMISE_KEY] = connectionPromise;
        connectionPromise.catch(() => {
            if (globalThis[CONNECTION_PROMISE_KEY] === connectionPromise) {
                delete globalThis[CONNECTION_PROMISE_KEY];
            }
        });
    }
    const connection = await connectionPromise;
    console.info(`MongoDB connected (${connection.connection.name})`);
    return connection;
};

export default connectDB;