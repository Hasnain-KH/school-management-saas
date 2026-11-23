import mongoose from "mongoose";
import { getConfig } from "./env.js";

const CONNECTION_PROMISE_KEY = "__schoolflowMongoConnectionPromise";
let listenersRegistered = false;

const registerConnectionListeners = () => {
    if (listenersRegistered) return;
    listenersRegistered = true;

    const clearCachedPromise = () => {
        delete globalThis[CONNECTION_PROMISE_KEY];
    };

    // `close` is terminal for this connection; transient `disconnected` events
    // are left to Mongoose so concurrent callers do not start duplicate connects.
    mongoose.connection.on("close", clearCachedPromise);
    mongoose.connection.on("reconnected", () => console.info("MongoDB reconnected"));
    mongoose.connection.on("error", (error) => {
        // Log only the error class: driver messages can contain host and URI details.
        console.error("MongoDB connection error", error?.name ?? "Error");
    });
};

const connectDB = async () => {
    if (mongoose.connection.readyState === 1) return mongoose.connection;
    const { mongoUri } = getConfig();
    registerConnectionListeners();
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
