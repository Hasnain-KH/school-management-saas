import AuditLog from "../models/audit-log.model.js";
import RefreshSession from "../models/refresh-session.model.js";
import School from "../models/school.model.js";
import SubscriptionPlan from "../models/subscription-plan.model.js";
import { HttpError } from "../utils/http-error.js";
import { withTransaction } from "../utils/transaction.js";

const pageInfo = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });

const writePlatformAudit = async (req, session, action, resourceType, resourceId, metadata = {}) => {
    await new AuditLog({
        schoolId: null,
        actorUserId: req.user._id,
        action,
        resourceType,
        resourceId,
        metadata
    }).save({ session });
};

const publicPlan = (plan) => plan.toObject ? plan.toObject() : plan;

export const createSubscriptionPlan = async (req, input) => withTransaction(async (session) => {
    if (input.isDefaultTrial) {
        await SubscriptionPlan.updateMany(
            { isDefaultTrial: true },
            { $set: { isDefaultTrial: false } },
            { session }
        );
    }
    const plan = new SubscriptionPlan(input);
    try {
        await plan.save({ session });
    } catch (error) {
        if (error?.code === 11000) throw new HttpError(409, "A subscription plan with that code or trial designation already exists");
        throw error;
    }
    await writePlatformAudit(req, session, "subscription_plan.created", "subscription_plan", plan._id, {
        code: plan.code
    });
    return publicPlan(plan);
});

export const listSubscriptionPlans = async (input) => {
    const filter = input.includeInactive ? {} : { isActive: true };
    if (input.search) {
        const escaped = input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.$or = [
            { name: new RegExp(escaped, "i") },
            { code: new RegExp(escaped, "i") }
        ];
    }
    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const [items, total] = await Promise.all([
        SubscriptionPlan.find(filter).sort({ name: 1, _id: 1 })
            .skip((page - 1) * limit).limit(limit).lean(),
        SubscriptionPlan.countDocuments(filter)
    ]);
    return { items, pagination: pageInfo(page, limit, total) };
};

export const updateSubscriptionPlan = async (req, planId, input) => withTransaction(async (session) => {
    const current = await SubscriptionPlan.findById(planId).session(session);
    if (!current) throw new HttpError(404, "Subscription plan was not found");
    if (input.isDefaultTrial === true && input.isActive === false) {
        throw new HttpError(400, "The default trial plan must be active");
    }
    if (input.isDefaultTrial === true && input.isActive === undefined && !current.isActive) {
        throw new HttpError(400, "Activate a plan before setting it as the default trial plan");
    }
    if (input.isActive === false && current.isDefaultTrial) {
        throw new HttpError(409, "The default trial plan cannot be deactivated");
    }
    if (input.isDefaultTrial) {
        await SubscriptionPlan.updateMany(
            { _id: { $ne: current._id }, isDefaultTrial: true },
            { $set: { isDefaultTrial: false } },
            { session }
        );
    }
    Object.assign(current, input);
    try {
        await current.save({ session });
    } catch (error) {
        if (error?.code === 11000) throw new HttpError(409, "A default trial plan is already configured");
        throw error;
    }
    await writePlatformAudit(req, session, "subscription_plan.updated", "subscription_plan", current._id, {
        fields: Object.keys(input)
    });
    return current.toObject();
});

export const listPlatformSchools = async (input) => {
    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const filter = { ...(input.status && { status: input.status }) };
    if (input.search) {
        const escaped = input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.$or = [
            { name: new RegExp(escaped, "i") },
            { slug: new RegExp(escaped, "i") },
            { email: new RegExp(escaped, "i") }
        ];
    }
    const [items, total] = await Promise.all([
        School.find(filter).sort({ createdAt: -1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
        School.countDocuments(filter)
    ]);
    return { items, pagination: pageInfo(page, limit, total) };
};

export const updateSchoolStatus = async (req, schoolId, status) => withTransaction(async (session) => {
    const school = await School.findById(schoolId).session(session);
    if (!school) throw new HttpError(404, "School was not found");
    if (status === "active" || status === "trial") {
        const validTrial = school.subscription.status === "trial"
            && school.subscription.trialEndsAt > new Date();
        const validSubscription = school.subscription.status === "active"
            && school.subscription.currentPeriodEnd > new Date();
        if ((status === "active" && !validSubscription)
            || (status === "trial" && !validTrial)) {
            throw new HttpError(409, "School requires a valid trial or active subscription before activation");
        }
        const plan = school.subscription.planId
            ? await SubscriptionPlan.findById(school.subscription.planId).session(session)
            : null;
        if (!plan || (status === "trial" && !plan.isDefaultTrial)
            || (status === "active" && plan.isDefaultTrial)) {
            throw new HttpError(409, "School must have an eligible subscription plan before activation");
        }
    }
    school.status = status;
    if (status === "expired") school.subscription.status = "canceled";
    await school.save({ session });
    if (status === "suspended" || status === "expired") {
        await RefreshSession.updateMany(
            { schoolId: school._id, revokedAt: null },
            { $set: { revokedAt: new Date() } },
            { session }
        );
    }
    await writePlatformAudit(req, session, `school.${status}`, "school", school._id);
    return school.toObject();
});

export const updateSchoolSubscription = async (req, schoolId, input) => withTransaction(async (session) => {
    const [school, plan] = await Promise.all([
        School.findById(schoolId).session(session),
        SubscriptionPlan.findOne({ _id: input.planId, isActive: true }).session(session)
    ]);
    if (!school) throw new HttpError(404, "School was not found");
    if (!plan) throw new HttpError(404, "An active subscription plan was not found");
    if (input.status === "trial" && !plan.isDefaultTrial) {
        throw new HttpError(409, "Trial subscriptions must use the active default trial plan");
    }
    if (input.status === "active" && new Date(input.currentPeriodEnd) <= new Date()) {
        throw new HttpError(400, "Active subscriptions require a future billing period end date");
    }
    if (input.status === "active" && plan.isDefaultTrial) {
        throw new HttpError(409, "The default trial plan cannot be used for a paid subscription");
    }
    if (input.status === "trial" && new Date(input.trialEndsAt) <= new Date()) {
        throw new HttpError(400, "Trial subscriptions require a future trial end date");
    }

    school.subscription.planId = plan._id;
    school.subscription.plan = plan.code;
    school.subscription.status = input.status;
    school.subscription.trialEndsAt = input.trialEndsAt ? new Date(input.trialEndsAt) : undefined;
    school.subscription.currentPeriodEnd = input.currentPeriodEnd
        ? new Date(input.currentPeriodEnd)
        : undefined;
    school.status = input.status === "trial" ? "trial"
        : input.status === "active" ? "active" : "suspended";
    await school.save({ session });
    if (input.status === "past_due" || input.status === "canceled") {
        await RefreshSession.updateMany(
            { schoolId: school._id, revokedAt: null },
            { $set: { revokedAt: new Date() } },
            { session }
        );
    }
    await writePlatformAudit(req, session, "school.subscription.updated", "school", school._id, {
        planId: plan._id,
        planCode: plan.code,
        subscriptionStatus: input.status
    });
    return school.toObject();
});
