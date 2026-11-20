// Minimal in-memory S3-compatible sink for isolated QA only.
// Accepts signed PUT/DELETE/GET requests without validating signatures.
// Stores bytes in memory only; no real object store is contacted.
// qa-server.js forces STORAGE_PROVIDER=s3, so Cloudinary is never selected here.
import http from "node:http";

const PORT = 5011;
const objects = new Map();

const server = http.createServer(async (req, res) => {
    const key = new URL(req.url, `http://127.0.0.1:${PORT}`).pathname;
    if (req.method === "PUT") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        objects.set(key, { body: Buffer.concat(chunks), contentType: req.headers["content-type"] ?? "application/octet-stream" });
        res.writeHead(200);
        res.end("");
        return;
    }
    if (req.method === "DELETE") {
        objects.delete(key);
        res.writeHead(204);
        res.end("");
        return;
    }
    if (req.method === "GET" || req.method === "HEAD") {
        const object = objects.get(key);
        if (!object) {
            res.writeHead(404);
            res.end("");
            return;
        }
        res.writeHead(200, { "Content-Type": object.contentType, "Content-Length": object.body.length });
        res.end(req.method === "HEAD" ? undefined : object.body);
        return;
    }
    res.writeHead(405);
    res.end("");
});

await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
console.info(`QA mock object storage ready on loopback port ${PORT}`);
