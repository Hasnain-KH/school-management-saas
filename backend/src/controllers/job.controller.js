import { createHash, timingSafeEqual } from "node:crypto";
import * as jobRunner from "../services/job-runner.service.js";
import { sendSuccess } from "../utils/responses.js";
import { HttpError } from "../utils/http-error.js";

const safeEqual = (left, right) => {
    const leftHash = createHash("sha256").update(String(left ?? "")).digest();
    const rightHash = createHash("sha256").update(String(right ?? "")).digest();
    return timingSafeEqual(leftHash, rightHash);
};

// Guards the scheduler endpoint with a shared secret supplied by the external
// cron trigger. Fails closed when the secret is not configured.
const requireJobSecret = (req, res, next) => {
    const secret = process.env.JOBS_RUNNER_SECRET;
    if (!secret) {
        return next(new HttpError(503, "The job runner is not configured"));
    }
    const provided = req.get("x-jobs-secret");
    if (!provided || !safeEqual(provided, secret)) {
        return next(new HttpError(401, "Invalid job runner credentials"));
    }
    return next();
};

export const listJobs = async (req, res) =>
    sendSuccess(res, 200, { jobs: jobRunner.listJobs() });

export const runJobs = async (req, res) => {
    const force = req.body?.force === true;
    const name = typeof req.body?.job === "string" ? req.body.job : null;
    const asOf = typeof req.body?.asOf === "string" ? req.body.asOf : undefined;
    const results = name
        ? [await jobRunner.runJob(name, { force, asOf })]
        : await jobRunner.runAllJobs({ force, asOf });
    return sendSuccess(res, 200, { results }, "Scheduled jobs executed");
};

export const requireJobSecretMiddleware = requireJobSecret;
