import mongoose from "mongoose";

// A ClientSession may only have one in-flight operation at a time. Never run
// session-bound queries with Promise.all inside a transaction: concurrent
// startTransaction commands at the same txnNumber are rejected by MongoDB with
// MongoServerError 117 (ConflictingOperationInProgress). Await them serially.
export const withTransaction = async (operation) => {
    const session = await mongoose.startSession();
    try {
        return await session.withTransaction(() => operation(session));
    } finally {
        await session.endSession();
    }
};
