import { createHash, randomBytes } from "node:crypto";
import AccountActionToken from "../models/account-action-token.model.js";
import AuditLog from "../models/audit-log.model.js";
import RefreshSession from "../models/refresh-session.model.js";
import School from "../models/school.model.js";
import User from "../models/user.model.js";
import { getEmailDeliveryProvider } from "./email-delivery.provider.js";
import { HttpError } from "../utils/http-error.js";
import { withTransaction } from "../utils/transaction.js";

const TOKEN_LIFETIME_MS = 30 * 60 * 1000;
const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const genericMessage = "If the account is eligible, instructions will be sent to its email address";

const createAndDeliverToken = async (user, type, provider) => {
    const rawToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS);
    await AccountActionToken.updateMany(
        { userId: user._id, type, consumedAt: null },
        { $set: { consumedAt: new Date() } }
    );
    const tokenRecord = await AccountActionToken.create({
        schoolId: user.schoolId ?? null,
        userId: user._id,
        type,
        tokenHash: hashToken(rawToken),
        expiresAt
    });

    try {
        const deliver = type === "password_reset"
            ? provider.sendPasswordReset
            : provider.sendEmailVerification;
        await deliver.call(provider, { email: user.email, token: rawToken, expiresAt });
    } catch {
        await AccountActionToken.updateOne(
            { _id: tokenRecord._id, consumedAt: null },
            { $set: { consumedAt: new Date() } }
        );
        throw new HttpError(503, "Email delivery failed; no account action was completed");
    }
};

const findAccount = async ({ email, schoolSlug }) => {
    let user;
    if (schoolSlug) {
        const school = await School.findOne({ slug: schoolSlug }).select("_id");
        user = school ? await User.findOne({ schoolId: school._id, email, status: "active" }) : null;
    } else {
        user = await User.findOne({
            email,
            role: "platform_super_admin",
            status: "active",
            schoolId: { $exists: false }
        });
    }
    return user;
};

export const requestPasswordRecovery = async (input) => {
    const provider = getEmailDeliveryProvider();
    const user = await findAccount(input);
    if (user) await createAndDeliverToken(user, "password_reset", provider);
    return { message: genericMessage };
};

export const requestEmailVerification = async (input) => {
    const provider = getEmailDeliveryProvider();
    const user = await findAccount(input);
    if (user && !user.emailVerifiedAt) {
        await createAndDeliverToken(user, "email_verification", provider);
    }
    return { message: genericMessage };
};

export const completeAccountAction = async (type, rawToken, password) => {
    const tokenHash = hashToken(rawToken);
    return withTransaction(async (session) => {
        const now = new Date();
        const token = await AccountActionToken.findOneAndUpdate(
            { type, tokenHash, consumedAt: null, expiresAt: { $gt: now } },
            { $set: { consumedAt: now } },
            { new: true, session }
        );
        if (!token) throw new HttpError(400, "The account action token is invalid or expired");
        const user = await User.findById(token.userId).session(session);
        if (!user
            || user.status !== "active"
            || String(token.schoolId ?? "") !== String(user.schoolId ?? "")) {
            throw new HttpError(400, "The account action token is invalid or expired");
        }

        if (type === "password_reset") {
            user.passwordHash = password;
            await user.save({ session });
            await RefreshSession.updateMany(
                { userId: user._id, revokedAt: null },
                { $set: { revokedAt: now } },
                { session }
            );
        } else {
            if (user.emailVerifiedAt) {
                throw new HttpError(409, "Email address has already been verified");
            }
            user.emailVerifiedAt = now;
            await user.save({ session });
        }

        await new AuditLog({
            schoolId: user.schoolId ?? null,
            actorUserId: user._id,
            action: type === "password_reset" ? "account.password_reset" : "account.email_verified",
            resourceType: "user",
            resourceId: user._id
        }).save({ session });
        return { completed: true };
    });
};
