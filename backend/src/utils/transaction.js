import mongoose from "mongoose";

export const withTransaction = async (operation) => {
    const session = await mongoose.startSession();
    try {
        return await session.withTransaction(() => operation(session));
    } finally {
        await session.endSession();
    }
};
