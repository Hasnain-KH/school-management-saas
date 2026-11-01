import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { getConfig } from "../config/env.js";
import AuditLog from "../models/audit-log.model.js";
import RefreshSession from "../models/refresh-session.model.js";
import School from "../models/school.model.js";
import SubscriptionPlan from "../models/subscription-plan.model.js";
import { isEmailDeliveryConfigured } from "./email-delivery.provider.js";
import { requestEmailVerification } from "./account-security.service.js";
import User from "../models/user.model.js";
import { HttpError } from "../utils/http-error.js";

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

const toPublicUser = (user) => ({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    schoolId: user.schoolId?.toString() ?? null,
    emailVerified: Boolean(user.emailVerifiedAt)
});

export const toPublicSchool = (school) => ({
    id: school._id.toString(),
    name: school.name,
    slug: school.slug,
    email: school.email,
    phone: school.phone,
    address: school.address,
    status: school.status,
    subscription: school.subscription,
    branches: school.branches,
    settings: school.settings
});

const createTokenPair = async (user, schoolId, session) => {
    const {
        accessSecret,
        refreshSecret,
        accessTokenTtl,
        refreshTokenTtl,
        refreshTokenTtlSeconds
    } = getConfig();
    const tokenId = randomUUID();
    const accessTokenId = randomUUID();
    const now = new Date();
    const refreshToken = jwt.sign(
        { tokenType: "refresh" },
        refreshSecret,
        {
            algorithm: "HS256",
            subject: user._id.toString(),
            jwtid: tokenId,
            expiresIn: refreshTokenTtl
        }
    );
    const accessToken = jwt.sign(
        { tokenType: "access" },
        accessSecret,
        {
            algorithm: "HS256",
            subject: user._id.toString(),
            jwtid: accessTokenId,
            expiresIn: accessTokenTtl
        }
    );

    const refreshSession = new RefreshSession({
        tokenId,
        accessTokenId,
        tokenHash: hashToken(refreshToken),
        userId: user._id,
        schoolId,
        expiresAt: new Date(now.getTime() + refreshTokenTtlSeconds * 1000)
    });
    await refreshSession.save({ session });

    return { accessToken, refreshToken };
};

export const slugFromName = (name) =>
    name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48).replace(/-+$/g, "");

const recordRegistration = async (school, user, session) => {
    const log = new AuditLog({
        schoolId: school._id,
        actorUserId: user._id,
        action: "school.registered",
        resourceType: "school",
        resourceId: school._id,
        metadata: { schoolSlug: school.slug }
    });
    await log.save({ session });
};

export const registerSchool = async (input) => {
    const trialPlan = await SubscriptionPlan.findOne({ isActive: true, isDefaultTrial: true });
    if (!trialPlan) {
        throw new HttpError(503, "School registration is unavailable until a default trial plan is configured");
    }
    const session = await mongoose.startSession();
    let result;

    try {
        await session.withTransaction(async () => {
            const slug = input.schoolSlug ?? slugFromName(input.schoolName);
            if (slug.length < 3) {
                throw new HttpError(400, "School name must produce a slug of at least 3 characters");
            }

            const school = new School({
                name: input.schoolName,
                slug,
                email: input.email,
                phone: input.phone,
                status: "trial",
                subscription: {
                    planId: trialPlan._id,
                    plan: trialPlan.code,
                    status: "trial",
                    trialEndsAt: new Date(
                        Date.now() + trialPlan.trialDurationDays * 24 * 60 * 60 * 1000
                    )
                }
            });
            await school.save({ session });

            const user = new User({
                schoolId: school._id,
                name: input.adminName,
                email: input.email,
                passwordHash: input.password,
                role: "school_admin",
                status: "active"
            });
            await user.save({ session });
            const tokens = await createTokenPair(user, school._id, session);
            await recordRegistration(school, user, session);

            result = {
                user: toPublicUser(user),
                school: toPublicSchool(school),
                ...tokens
            };
        });
    } catch (error) {
        if (error?.code === 11000) {
            throw new HttpError(409, "That school slug is already registered");
        }
        throw error;
    } finally {
        await session.endSession();
    }

    if (isEmailDeliveryConfigured()) {
        await requestEmailVerification({ email: input.email, schoolSlug: result.school.slug });
        return {
            user: result.user,
            school: result.school,
            emailVerificationRequired: true
        };
    }
    return result;
};

const assertSchoolAccessible = (school) => {
    if (!school || !["trial", "active"].includes(school.status)) {
        throw new HttpError(403, "School access is not available");
    }
    if (school.status === "trial" && (
        school.subscription.status !== "trial"
        || (school.subscription.trialEndsAt && school.subscription.trialEndsAt <= new Date())
    )) {
        throw new HttpError(403, "School trial has expired");
    }
    if (school.status === "active" && (
        school.subscription.status !== "active"
        || (school.subscription.currentPeriodEnd && school.subscription.currentPeriodEnd <= new Date())
    )) {
        throw new HttpError(403, "School subscription is not active");
    }
};

export const login = async ({ schoolSlug, email, password }) => {
    const school = schoolSlug ? await School.findOne({ slug: schoolSlug }) : null;
    const userQuery = schoolSlug
        ? school
            ? { schoolId: school._id, email }
            : null
        : { schoolId: { $exists: false }, email, role: "platform_super_admin" };
    const user = userQuery ? await User.findOne(userQuery).select("+passwordHash") : null;

    if (!user || !(await user.verifyPassword(password))) {
        throw new HttpError(401, "Invalid email, password, or school");
    }
    if (user.status !== "active") {
        throw new HttpError(403, "This account is disabled");
    }
    if (user.role !== "platform_super_admin"
        && isEmailDeliveryConfigured()
        && !user.emailVerifiedAt) {
        throw new HttpError(403, "Email address verification is required");
    }
    if (user.role === "platform_super_admin") {
        if (schoolSlug || user.schoolId) {
            throw new HttpError(401, "Invalid email, password, or school");
        }
    } else {
        assertSchoolAccessible(school);
    }

    let tokens;
    if (user.role === "platform_super_admin") {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                tokens = await createTokenPair(user, user.schoolId, session);
                const auditEvent = new AuditLog({
                    schoolId: null,
                    actorUserId: user._id,
                    action: "platform.super_admin.signed_in",
                    resourceType: "platform",
                    resourceId: user._id
                });
                await auditEvent.save({ session });
            });
        } finally {
            await session.endSession();
        }
    } else {
        tokens = await createTokenPair(user, user.schoolId);
    }
    return { user: toPublicUser(user), ...tokens };
};

const verifyRefreshToken = (token) => {
    try {
        const { refreshSecret } = getConfig();
        const claims = jwt.verify(token, refreshSecret, { algorithms: ["HS256"] });
        if (claims.tokenType !== "refresh" || !claims.sub || !claims.jti) {
            throw new Error("Invalid refresh token claims");
        }
        return claims;
    } catch {
        throw new HttpError(401, "Refresh token is invalid or expired");
    }
};

export const refreshTokens = async (refreshToken) => {
    const claims = verifyRefreshToken(refreshToken);
    const session = await mongoose.startSession();
    let result;

    try {
        await session.withTransaction(async () => {
            const currentSession = await RefreshSession.findOne({
                tokenId: claims.jti,
                userId: claims.sub,
                tokenHash: hashToken(refreshToken),
                revokedAt: null,
                expiresAt: { $gt: new Date() }
            }).session(session);
            if (!currentSession) {
                throw new HttpError(401, "Refresh token is invalid or has been revoked");
            }

            const user = await User.findById(claims.sub).session(session);
            if (!user || user.status !== "active") {
                throw new HttpError(401, "This account is not available");
            }

            if (user.schoolId) {
                const school = await School.findById(user.schoolId).session(session);
                assertSchoolAccessible(school);
            }

            currentSession.revokedAt = new Date();
            await currentSession.save({ session });
            const tokens = await createTokenPair(user, user.schoolId, session);
            result = { user: toPublicUser(user), ...tokens };
        });
    } finally {
        await session.endSession();
    }

    return result;
};

export const logout = async (user, accessTokenId, refreshToken) => {
    const claims = verifyRefreshToken(refreshToken);
    if (claims.sub !== user._id.toString()) {
        throw new HttpError(401, "Refresh token is invalid");
    }

    const result = await RefreshSession.updateOne(
        {
            tokenId: claims.jti,
            accessTokenId,
            userId: user._id,
            tokenHash: hashToken(refreshToken),
            revokedAt: null
        },
        { $set: { revokedAt: new Date() } }
    );
    if (result.modifiedCount !== 1) {
        throw new HttpError(401, "Refresh token is invalid or has been revoked");
    }
};
