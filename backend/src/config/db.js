import mongoose from "mongoose";
import { getConfig } from "./env.js";

const connectDB = async () => {
    const { mongoUri } = getConfig();
    const connection = await mongoose.connect(mongoUri, {
        autoIndex: process.env.NODE_ENV !== "production"
    });
    console.info(`MongoDB connected (${connection.connection.name})`);
    return connection;
};

export default connectDB;