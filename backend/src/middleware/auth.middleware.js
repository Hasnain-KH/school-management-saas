import jwt from "jsonwebtoken";
import { getConfig } from "../config/env.js";
import RefreshSession from "../models/refresh-session.model.js";
import School from "../models/school.model.js";
import SubscriptionPlan from "../models/subscription-plan.model.js";
import User from "../models/user.model.js";
import { isEmailDeliveryConfigured } from "../services/email-delivery.provider.js";
import { HttpError } from "../utils/http-error.js";

const unauthorized = () => new HttpError(401, "Authentication is required");

export const requireAuth = async (req, res, next) => {
    const header = req.get("authorization");
    const match = header?.match(/^Bearer\s+(.+)$/i);

    if (!match) {
        return next(unauthorized());
    }

    try {
        const { accessSecret } = getConfig();
        const claims = jwt.verify(match[1], accessSecret, { algorithms: ["HS256"] });
        if (claims.tokenType !== "access" || !claims.sub || !claims.jti) {
            return next(unauthorized());
        }

        const [session, user] = await Promise.all([
            RefreshSession.findOne({
                accessTokenId: claims.jti,
                revokedAt: null,
                expiresAt: { $gt: new Date() }
            }),
            User.findById(claims.sub)
        ]);

        if (!session || !user || user.status !== "active" || String(session.userId) !== String(user._id)) {
            return next(unauthorized());
        }
        if (user.role !== "platform_super_admin"
            && isEmailDeliveryConfigured()
            && !user.emailVerifiedAt) {
            return next(new HttpError(403, "Email address verification is required"));
        }

        req.authSession = session;
        let school = null;
        if (user.role !== "platform_super_admin") {
            if (!user.schoolId || String(session.schoolId) !== String(user.schoolId)) {
                return next(unauthorized());
            }

            school = await School.findById(user.schoolId);
            if (!school || !["active", "trial"].includes(school.status)) {
                return next(new HttpError(403, "School access is not available"));
            }
            if (school.status === "trial" && (
                school.subscription.status !== "trial"
                || (school.subscription.trialEndsAt && school.subscription.trialEndsAt <= new Date())
            )) {
                return next(new HttpError(403, "School trial has expired"));
            }
            if (school.status === "active" && (
                school.subscription.status !== "active"
                || (school.subscription.currentPeriodEnd && school.subscription.currentPeriodEnd <= new Date())
            )) {
                return next(new HttpError(403, "School subscription is not active"));
            }
            req.subscriptionPlan = school.subscription.planId
                ? await SubscriptionPlan.findById(school.subscription.planId).lean()
                : school.subscription.plan
                    ? await SubscriptionPlan.findOne({ code: school.subscription.plan }).lean()
                    : null;
        } else if (user.schoolId || session.schoolId) {
            return next(unauthorized());
        } else {
            req.subscriptionPlan = null;
        }

        req.user = user;
        req.school = school;
        return next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
            return next(unauthorized());
        }
        return next(error);
    }
};
