// Isolated, disposable QA runtime used only for real integration testing.
//
// Safety properties:
//  - Starts a local MongoDB replica set on a fixed loopback port. It is NOT the
//    shared Atlas cluster and NOT the shared `test` database.
//  - The only database name used is `schoolflow_test_qa`, validated before use.
//  - Runs a local HTTP sink that accepts email payloads. No real email is sent.
//  - Prints no credentials, connection strings, or message content.
//
// Nothing here writes to MONGO_URI from .env, and .env is never modified.
import http from "node:http";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { validateMongoTestUri } from "../src/testing/mongo-test-safety.js";

const MONGO_PORT = 27018;
const EMAIL_PORT = 5010;
const DB_NAME = "schoolflow_test_qa";
const REPLSET_NAME = "schoolflowqa";
const EMAIL_CAPTURE_DIR = join(tmpdir(), "schoolflow-qa");
const EMAIL_CAPTURE_FILE = join(EMAIL_CAPTURE_DIR, "emails.jsonl");

await mkdir(EMAIL_CAPTURE_DIR, { recursive: true });

const emailSink = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let to = [];
    let subject = "";
    let token = "";
    try {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        to = Array.isArray(payload.to) ? payload.to : [];
        subject = typeof payload.subject === "string" ? payload.subject : "";
        const match = /(?:verify|reset|token)[^\n]{0,200}?([A-Za-z0-9_-]{40,100})/i.exec(payload.text ?? payload.html ?? "");
        token = match?.[1] ?? "";
    } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end('{"success":false}');
        return;
    }
    await appendFile(EMAIL_CAPTURE_FILE, `${JSON.stringify({ to, subject, token, at: new Date().toISOString() })}\n`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"id":"qa-mocked-email"}');
});
await new Promise((resolve) => emailSink.listen(EMAIL_PORT, "127.0.0.1", resolve));

const replSet = await MongoMemoryReplSet.create({
    instanceOpts: [{ port: MONGO_PORT, ip: "127.0.0.1" }],
    replSet: { count: 1, name: REPLSET_NAME, dbName: DB_NAME, storageEngine: "wiredTiger" }
});
const uri = replSet.getUri(DB_NAME);
validateMongoTestUri(uri);

// Prove the connection is isolated and the database name is exactly the QA name.
const connection = await mongoose.createConnection(uri).asPromise();
const actualDbName = connection.db?.databaseName;
if (actualDbName !== DB_NAME) {
    await connection.close();
    throw new Error(`Isolated database name mismatch: ${actualDbName}`);
}
await connection.close();

console.info(`QA isolated environment ready on loopback ports ${MONGO_PORT} (MongoDB) and ${EMAIL_PORT} (mock email)`);
console.info(`QA database: ${DB_NAME}`);

let stopping = false;
const stop = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.info(`${signal}: stopping isolated QA environment`);
    await new Promise((resolve) => emailSink.close(resolve));
    await replSet.stop();
    process.exit(0);
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
