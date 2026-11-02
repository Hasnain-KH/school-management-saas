import mongoose from "mongoose";

const allowedDatabasePattern = /^schoolflow_test(?:_|$)/i;
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const allowedProtocols = new Set(["mongodb:", "mongodb+srv:"]);

export const validateMongoTestUri = (value) => {
    const scheme = typeof value === "string"
        ? value.match(/^([a-z][a-z\d+.-]*):\/\//i)?.[1]
        : undefined;
    const protocol = scheme ? `${scheme.toLowerCase()}:` : "";
    if (protocol && !allowedProtocols.has(protocol)) {
        throw new Error("MONGO_TEST_URI must use mongodb:// or mongodb+srv://");
    }
    if (!protocol) {
        throw new Error("MONGO_TEST_URI must be a valid MongoDB URI");
    }

    let client;
    try {
        client = new mongoose.mongo.MongoClient(value);
    } catch {
        throw new Error("MONGO_TEST_URI must be a valid MongoDB URI");
    }

    const databaseName = client.options.dbName;
    if (
        !allowedDatabasePattern.test(databaseName)
        || /[\/\\."$*<>:|?\0]/.test(databaseName)
    ) {
        throw new Error("MONGO_TEST_URI must name an isolated database beginning with schoolflow_test");
    }

    const hosts = client.options.srvHost
        ? [client.options.srvHost]
        : client.options.hosts.map(({ host }) => host);
    if (!hosts.length) {
        throw new Error("MONGO_TEST_URI must be a valid MongoDB URI");
    }
    if (
        !hosts.every((host) => loopbackHosts.has(host.toLowerCase()))
        && process.env.MONGO_TEST_ALLOW_REMOTE !== "true"
    ) {
        throw new Error(
            "Set MONGO_TEST_ALLOW_REMOTE=true only after confirming the URI targets a dedicated non-production test cluster"
        );
    }
    return value;
};
