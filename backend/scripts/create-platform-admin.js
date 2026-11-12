// One-time bootstrap for the first platform super admin.
//
// There is intentionally no public route that creates a `platform_super_admin`
// (see docs/DATA-MODELS.md and docs/REMAINING-TASKS.md). Run this script once,
// from a trusted machine, against the target database:
//
//   PLATFORM_ADMIN_EMAIL=you@example.com npm run db:create-admin
//
// Credentials are read from the environment, or from a hidden interactive
// prompt when PLATFORM_ADMIN_PASSWORD is not set. The password is hashed by the
// User model's existing bcrypt pre-save hook and is never printed or logged.
//
// Properties:
//   - Idempotent: if a platform_super_admin with the given email already exists,
//     the script makes no changes and reports the existing account.
//   - Non-destructive: existing users are never modified or deleted.
//   - Least privilege: the account is created with only the
//     `platform_super_admin` role and no school tenant.
//
// Environment:
//   PLATFORM_ADMIN_EMAIL        required  - login email for the new admin
//   PLATFORM_ADMIN_PASSWORD     optional  - read from here, else hidden prompt
//   PLATFORM_ADMIN_NAME         optional  - display name (default: "Platform Super Admin")
//
// Operator convenience (never prints the secret):
//   --generate-password         generate a strong password and write it to
//                               PLATFORM_ADMIN_PASSWORD_OUT (or the OS temp dir)

import "dotenv/config";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import AuditLog from "../src/models/audit-log.model.js";
import User from "../src/models/user.model.js";

const ROLE = "platform_super_admin";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const MIN_PASSWORD_LENGTH = 12;

const fail = (message) => {
    throw new Error(message);
};

// Set after the password is read so top-level error output can never echo it.
let sensitiveValue = "";

// Reads a line with terminal echo disabled, so the password never appears on
// screen or in shell history.
const promptHidden = (question) => new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    let value = "";
    const cleanup = () => {
        stdin.removeListener("data", onData);
        if (stdin.isTTY) stdin.setRawMode(wasRaw);
        stdin.pause();
    };
    const onData = (chunk) => {
        for (const char of chunk.toString("utf8")) {
            if (char === "\r" || char === "\n") {
                cleanup();
                stdout.write("\n");
                return resolve(value);
            }
            if (char === "\u0003" || char === "\u0004") {
                cleanup();
                stdout.write("\n");
                return reject(new Error("Cancelled"));
            }
            if (char === "\u007f" || char === "\b") {
                value = value.slice(0, -1);
                continue;
            }
            value += char;
        }
    };
    stdin.on("data", onData);
});

const readPassword = async () => {
    if (process.argv.includes("--generate-password")) {
        const generated = randomBytes(32).toString("base64url");
        const outPath = process.env.PLATFORM_ADMIN_PASSWORD_OUT
            || join(tmpdir(), "schoolflow-platform-admin-password.txt");
        writeFileSync(outPath, `${generated}\n`, { mode: 0o600 });
        console.info(`Generated a strong password and wrote it to: ${outPath}`);
        console.info("Sign in with it, change the password, then delete that file.");
        return generated;
    }
    if (process.env.PLATFORM_ADMIN_PASSWORD) {
        return process.env.PLATFORM_ADMIN_PASSWORD;
    }
    if (!process.stdin.isTTY) {
        fail("PLATFORM_ADMIN_PASSWORD must be set when not running in an interactive terminal");
    }
    const password = await promptHidden("Platform super admin password (hidden): ");
    const confirmation = await promptHidden("Confirm password (hidden): ");
    if (password !== confirmation) fail("Passwords do not match");
    return password;
};

// Prints only non-secret facts and asserts the stored shape. The password hash
// is verified to be a bcrypt digest but is never displayed.
const report = async (user, created) => {
    const fresh = await User.findById(user._id).select("+passwordHash");
    const hashStored = typeof fresh?.passwordHash === "string"
        && BCRYPT_HASH_PATTERN.test(fresh.passwordHash);
    console.info(created
        ? "Platform super admin created."
        : "Platform super admin already exists; no changes were made (idempotent).");
    console.info(`  id:        ${fresh._id}`);
    console.info(`  email:     ${fresh.email}`);
    console.info(`  role:      ${fresh.role}`);
    console.info(`  status:    ${fresh.status}`);
    console.info(`  schoolId:  ${fresh.schoolId ? String(fresh.schoolId) : "(none)"}`);
    console.info(`  password:  ${hashStored ? "bcrypt hash stored (verified)" : "UNEXPECTED - not a bcrypt hash"}`);
    if (fresh.role !== ROLE || fresh.status !== "active" || fresh.schoolId || !hashStored) {
        fail("Verification failed: the account does not match the expected platform super admin shape");
    }
};

const run = async () => {
    if (!process.env.MONGO_URI) fail("MONGO_URI is required");

    const email = (process.env.PLATFORM_ADMIN_EMAIL ?? "").trim().toLowerCase();
    if (!email) fail("PLATFORM_ADMIN_EMAIL is required");
    if (!EMAIL_PATTERN.test(email)) fail("PLATFORM_ADMIN_EMAIL is not a valid email address");
    const name = (process.env.PLATFORM_ADMIN_NAME ?? "").trim() || "Platform Super Admin";

    const password = await readPassword();
    sensitiveValue = password;
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
        fail(`The platform super admin password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
    try {
        const existing = await User.findOne({ email, role: ROLE });
        if (existing) {
            await report(existing, false);
            return;
        }

        const user = new User({
            name,
            email,
            role: ROLE,
            status: "active"
            // No schoolId: platform super admins are not school-scoped.
        });
        user.passwordHash = password; // Hashed by the model's bcrypt pre-save hook.

        try {
            await user.save();
        } catch (error) {
            // A concurrent run may have created the same admin first.
            if (error?.code === 11000) {
                const raced = await User.findOne({ email, role: ROLE });
                if (raced) {
                    await report(raced, false);
                    return;
                }
            }
            throw error;
        }

        await new AuditLog({
            schoolId: null,
            actorUserId: user._id,
            action: "platform.super_admin.provisioned",
            resourceType: "platform",
            resourceId: user._id
        }).save();

        await report(user, true);
    } finally {
        await mongoose.disconnect();
    }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        await run();
    } catch (error) {
        const message = String(error?.message ?? error?.name ?? "Error");
        const safeMessage = sensitiveValue ? message.split(sensitiveValue).join("<redacted>") : message;
        console.error("Platform super admin provisioning failed:", safeMessage);
        process.exitCode = 1;
    }
}
