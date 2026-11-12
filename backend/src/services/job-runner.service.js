import JobRun from "../models/job-run.model.js";
import RefreshSession from "../models/refresh-session.model.js";
import School from "../models/school.model.js";
import { isEmailDeliveryConfigured } from "./email-delivery.provider.js";
import { dispatchSchoolOverdueFeeReminders } from "./fee-reminder.service.js";
import { HttpError } from "../utils/http-error.js";

const LEASE_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const JOB_NAMES = Object.freeze({
    FEE_REMINDERS: "fee_reminders",
    SUBSCRIPTION_EXPIRY: "subscription_expiry"
});

const utcDateKey = (date) => date.toISOString().slice(0, 10);

// Atomically claims the right to run a job for a given key. Returns claimed:false
// when the job already completed (or another instance is still running it).
const claimJob = async (name, runKey, force) => {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
    const reclaimable = force
        ? { $or: [{ status: { $ne: "running" } }, { status: "running", leaseExpiresAt: { $lt: now } }] }
        : { $or: [{ status: "failed" }, { status: "running", leaseExpiresAt: { $lt: now } }] };

    const existing = await JobRun.findOneAndUpdate(
        { name, runKey, ...reclaimable },
        {
            $set: { status: "running", startedAt: now, leaseExpiresAt, finishedAt: null, errorCode: null },
            $inc: { attempts: 1 }
        },
        { new: true }
    );
    if (existing) return { run: existing, claimed: true };

    try {
        const run = await JobRun.create({
            name,
            runKey,
            status: "running",
            attempts: 1,
            startedAt: now,
            leaseExpiresAt
        });
        return { run, claimed: true };
    } catch (error) {
        if (error?.code === 11000) {
            const current = await JobRun.findOne({ name, runKey }).lean();
            return { run: current, claimed: false };
        }
        throw error;
    }
};

const finishJob = async (run, status, result, errorCode = null) => {
    await JobRun.updateOne(
        { _id: run._id },
        {
            $set: {
                status,
                result: result ?? {},
                finishedAt: new Date(),
                leaseExpiresAt: null,
                errorCode
            }
        }
    );
};

// --- Job implementations ---------------------------------------------------

const runFeeReminders = async ({ asOf, limit } = {}) => {
    if (!isEmailDeliveryConfigured()) {
        return { skipped: true, reason: "email_not_configured", schools: 0, sent: 0, failed: 0 };
    }
    const schools = await School.find({ status: { $in: ["active", "trial"] } }).select("_id").lean();
    const summary = { schools: schools.length, examined: 0, sent: 0, failed: 0, skipped: 0 };
    for (const school of schools) {
        try {
            const result = await dispatchSchoolOverdueFeeReminders(school._id, { asOf, limit });
            summary.examined += result.examined;
            summary.sent += result.sent;
            summary.failed += result.failed;
            summary.skipped += result.skipped;
        } catch (error) {
            summary.failed += 1;
            console.error("Fee reminder job failed for a school", {
                schoolId: String(school._id),
                name: error?.name ?? "Error"
            });
        }
    }
    return summary;
};

const runSubscriptionExpiry = async ({ now = new Date() } = {}) => {
    const expiredTrials = await School.find({
        status: "trial",
        "subscription.trialEndsAt": { $lte: now }
    }).select("_id").lean();
    const expiredActive = await School.find({
        status: "active",
        "subscription.currentPeriodEnd": { $lte: now }
    }).select("_id").lean();
    const ids = [...expiredTrials, ...expiredActive].map(({ _id }) => _id);
    if (ids.length) {
        await School.updateMany(
            { _id: { $in: ids } },
            { $set: { status: "expired", "subscription.status": "canceled" } }
        );
        await RefreshSession.updateMany(
            { schoolId: { $in: ids }, revokedAt: null },
            { $set: { revokedAt: new Date() } }
        );
    }
    return { expiredTrials: expiredTrials.length, expiredSubscriptions: expiredActive.length };
};

const JOB_DEFINITIONS = {
    [JOB_NAMES.FEE_REMINDERS]: { run: runFeeReminders, daily: true },
    [JOB_NAMES.SUBSCRIPTION_EXPIRY]: { run: runSubscriptionExpiry, daily: true }
};

// --- Public API ------------------------------------------------------------

export const listJobs = () =>
    Object.entries(JOB_DEFINITIONS).map(([name, definition]) => ({ name, daily: definition.daily }));

export const runJob = async (name, { force = false, asOf } = {}) => {
    const definition = JOB_DEFINITIONS[name];
    if (!definition) throw new HttpError(404, "Unknown scheduled job");
    const runKey = `${name}:${utcDateKey(asOf ? new Date(`${asOf}T00:00:00.000Z`) : new Date())}`;
    const { run, claimed } = await claimJob(name, runKey, force);
    if (!claimed) {
        return { name, runKey, skipped: true, status: run?.status ?? "unknown" };
    }
    try {
        const result = await definition.run({ asOf, now: new Date() });
        await finishJob(run, "completed", result);
        return { name, runKey, skipped: false, result };
    } catch (error) {
        await finishJob(run, "failed", {}, String(error?.code || error?.name || "JOB_ERROR").slice(0, 120));
        console.error(`Scheduled job ${name} failed`, { name: error?.name ?? "Error" });
        throw error;
    }
};

export const runAllJobs = async (options = {}) => {
    const results = [];
    for (const name of Object.keys(JOB_DEFINITIONS)) {
        try {
            results.push(await runJob(name, options));
        } catch (error) {
            results.push({ name, error: String(error?.code || error?.name || "JOB_ERROR") });
        }
    }
    return results;
};

// Optional in-process scheduler for local development and long-running hosts.
// Never enabled by default: Vercel should use the secured /api/v1/jobs/run
// endpoint driven by Vercel Cron or an external scheduler.
export const startDevScheduler = () => {
    if (process.env.ENABLE_DEV_SCHEDULER !== "true") return null;
    const intervalMs = Number(process.env.DEV_SCHEDULER_INTERVAL_MS ?? DAY_MS);
    const safeInterval = Number.isFinite(intervalMs) && intervalMs >= 60000 ? intervalMs : DAY_MS;
    const timer = setInterval(() => {
        runAllJobs().catch(() => {});
    }, safeInterval);
    timer.unref?.();
    console.info(`In-process scheduler enabled (every ${safeInterval}ms)`);
    return timer;
};
