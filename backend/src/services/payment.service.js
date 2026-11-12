import AuditLog from "../models/audit-log.model.js";
import Payment from "../models/payment.model.js";
import School from "../models/school.model.js";
import SubscriptionPlan from "../models/subscription-plan.model.js";
import { getPaymentGatewayProvider } from "./payment-gateway.provider.js";
import { HttpError } from "../utils/http-error.js";
import { withTransaction } from "../utils/transaction.js";

const pageInfo = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });

const publicPayment = (payment) => ({
    id: String(payment._id),
    schoolId: String(payment.schoolId),
    planId: payment.planId ? String(payment.planId) : null,
    planCode: payment.planCode ?? null,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    status: payment.status,
    method: payment.method,
    provider: payment.provider ?? null,
    providerReference: payment.providerReference ?? null,
    billingInterval: payment.billingInterval ?? null,
    periodStart: payment.periodStart ?? null,
    periodEnd: payment.periodEnd ?? null,
    notes: payment.notes ?? null,
    paidAt: payment.paidAt ?? null,
    createdAt: payment.createdAt
});

// Adds one billing interval to a date. Monthly and annual are the only
// intervals a subscription plan may declare.
export const addBillingPeriod = (interval, from = new Date()) => {
    const end = new Date(from);
    if (interval === "annual") {
        end.setUTCFullYear(end.getUTCFullYear() + 1);
    } else {
        end.setUTCMonth(end.getUTCMonth() + 1);
    }
    return end;
};

const writePaymentAudit = (session, actorUserId, action, payment, metadata = {}) =>
    new AuditLog({
        schoolId: payment.schoolId,
        actorUserId: actorUserId ?? null,
        action,
        resourceType: "payment",
        resourceId: payment._id,
        metadata
    }).save({ session });

// Extends the school's active subscription from whichever is later: the current
// paid-through date or now. Used by both manual recordings and paid webhooks.
const applyPaidSubscription = async (actorUserId, school, payment, session) => {
    const now = new Date();
    const currentEnd = school.subscription?.currentPeriodEnd;
    const base = currentEnd && new Date(currentEnd) > now ? new Date(currentEnd) : now;
    const periodEnd = payment.periodEnd && new Date(payment.periodEnd) > base
        ? new Date(payment.periodEnd)
        : addBillingPeriod(payment.billingInterval ?? "monthly", base);

    if (payment.planId) school.subscription.planId = payment.planId;
    if (payment.planCode) school.subscription.plan = payment.planCode;
    school.subscription.status = "active";
    school.subscription.currentPeriodEnd = periodEnd;
    school.subscription.trialEndsAt = undefined;
    school.status = "active";
    await school.save({ session });

    await new AuditLog({
        schoolId: school._id,
        actorUserId: actorUserId ?? null,
        action: "school.subscription.renewed",
        resourceType: "school",
        resourceId: school._id,
        metadata: { planCode: payment.planCode, periodEnd }
    }).save({ session });

    return periodEnd;
};

// Records an offline (manual) payment such as a bank transfer. Optionally
// activates/extends the school subscription from the recorded payment.
export const recordManualPayment = async (req, schoolId, input) => withTransaction(async (session) => {
    const school = await School.findById(schoolId).session(session);
    if (!school) throw new HttpError(404, "School was not found");

    let plan = null;
    if (input.planId) {
        plan = await SubscriptionPlan.findOne({ _id: input.planId, isActive: true }).session(session);
        if (!plan) throw new HttpError(404, "An active subscription plan was not found");
        if (plan.isDefaultTrial) throw new HttpError(409, "The default trial plan cannot be purchased");
    }

    const amountMinor = input.amountMinor ?? plan?.priceMinor;
    if (amountMinor === undefined || amountMinor === null) {
        throw new HttpError(400, "A payment amount is required when no plan is selected");
    }
    const currency = String(input.currency ?? plan?.currency ?? "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
        throw new HttpError(400, "A valid 3-letter currency is required");
    }
    const billingInterval = plan?.billingInterval ?? input.billingInterval ?? "monthly";
    const periodStart = input.periodStart ? new Date(input.periodStart) : new Date();
    const periodEnd = input.periodEnd
        ? new Date(input.periodEnd)
        : addBillingPeriod(billingInterval, periodStart);

    const payment = new Payment({
        schoolId: school._id,
        planId: plan?._id ?? null,
        planCode: plan?.code ?? null,
        amountMinor,
        currency,
        status: "paid",
        method: "manual",
        billingInterval,
        periodStart,
        periodEnd,
        notes: input.notes ?? null,
        recordedBy: req.user?._id ?? null,
        paidAt: new Date()
    });
    await payment.save({ session });
    await writePaymentAudit(session, req.user?._id, "payment.recorded", payment, {
        amountMinor,
        currency,
        method: "manual"
    });

    if (input.applySubscription) {
        await applyPaidSubscription(req.user?._id, school, payment, session);
    }

    return publicPayment(payment);
});

// Creates a gateway checkout session for a paid plan. Fails with 503 until a
// real payment gateway adapter is configured.
export const createCheckout = async (req, schoolId, input) => {
    const provider = getPaymentGatewayProvider();
    const [school, plan] = await Promise.all([
        School.findById(schoolId).lean(),
        SubscriptionPlan.findOne({ _id: input.planId, isActive: true }).lean()
    ]);
    if (!school) throw new HttpError(404, "School was not found");
    if (!plan) throw new HttpError(404, "An active subscription plan was not found");
    if (plan.isDefaultTrial) throw new HttpError(409, "The default trial plan cannot be purchased");

    const periodStart = new Date();
    const periodEnd = addBillingPeriod(plan.billingInterval, periodStart);
    const payment = new Payment({
        schoolId: school._id,
        planId: plan._id,
        planCode: plan.code,
        amountMinor: plan.priceMinor,
        currency: plan.currency,
        status: "pending",
        method: "gateway",
        provider: provider.name ?? "gateway",
        billingInterval: plan.billingInterval,
        periodStart,
        periodEnd,
        recordedBy: req.user?._id ?? null
    });
    await payment.save();

    try {
        const checkout = await provider.createCheckoutSession({
            payment: { id: String(payment._id), amountMinor: payment.amountMinor, currency: payment.currency },
            school: { id: String(school._id), name: school.name, email: school.email },
            plan: { code: plan.code, name: plan.name, billingInterval: plan.billingInterval },
            successUrl: input.successUrl,
            cancelUrl: input.cancelUrl
        });
        payment.providerReference = checkout?.reference ?? checkout?.id ?? null;
        if (checkout?.provider) payment.provider = String(checkout.provider).slice(0, 40);
        await payment.save();
        return {
            paymentId: String(payment._id),
            reference: payment.providerReference,
            checkoutUrl: checkout?.url ?? null
        };
    } catch (error) {
        payment.status = "failed";
        await payment.save().catch(() => {});
        throw error;
    }
};

// Applies a verified gateway webhook idempotently: a reference that is already
// paid is never processed twice.
export const handleGatewayWebhook = async (headers, body) => {
    const provider = getPaymentGatewayProvider();
    const event = await provider.verifyWebhook({ headers, body });
    if (!event?.reference) {
        throw new HttpError(400, "The webhook payload did not include a payment reference");
    }

    // Fast idempotency check before taking a transaction.
    const existing = await Payment.findOne({ providerReference: event.reference }).lean();
    if (!existing) throw new HttpError(404, "No matching payment was found for this reference");
    if (existing.status === "paid") {
        return { received: true, alreadyProcessed: true, paymentId: String(existing._id) };
    }

    return withTransaction(async (session) => {
        const payment = await Payment.findOne({ providerReference: event.reference }).session(session);
        if (!payment) throw new HttpError(404, "No matching payment was found for this reference");
        if (payment.status === "paid") {
            return { received: true, alreadyProcessed: true, paymentId: String(payment._id) };
        }
        if (event.status !== "paid") {
            payment.status = event.status === "failed" ? "failed" : "pending";
            await payment.save({ session });
            return { received: true, alreadyProcessed: false, status: payment.status };
        }

        payment.status = "paid";
        payment.paidAt = event.paidAt ? new Date(event.paidAt) : new Date();
        if (event.amountMinor !== undefined) payment.amountMinor = event.amountMinor;
        if (event.currency) payment.currency = String(event.currency).toUpperCase();
        await payment.save({ session });
        await writePaymentAudit(session, null, "payment.confirmed", payment, {
            provider: payment.provider,
            reference: payment.providerReference
        });

        const school = await School.findById(payment.schoolId).session(session);
        if (school) await applyPaidSubscription(null, school, payment, session);

        return { received: true, alreadyProcessed: false, status: "paid", paymentId: String(payment._id) };
    });
};

export const listPayments = async (input) => {
    const filter = {};
    if (input.schoolId) filter.schoolId = input.schoolId;
    if (input.status) filter.status = input.status;
    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const [items, total] = await Promise.all([
        Payment.find(filter).sort({ createdAt: -1, _id: -1 })
            .skip((page - 1) * limit).limit(limit).lean(),
        Payment.countDocuments(filter)
    ]);
    return { items: items.map(publicPayment), pagination: pageInfo(page, limit, total) };
};

export const listSchoolPayments = async (req, input) => {
    if (!req.school?._id) throw new HttpError(403, "A school tenant context is required");
    return listPayments({ ...input, schoolId: req.school._id });
};

// Platform revenue report. Every figure is aggregated from recorded payments;
// nothing is hardcoded.
export const revenueReport = async (input = {}) => {
    const match = { status: "paid" };
    if (input.from || input.to) {
        match.paidAt = {};
        if (input.from) match.paidAt.$gte = new Date(`${input.from}T00:00:00.000Z`);
        if (input.to) match.paidAt.$lte = new Date(`${input.to}T23:59:59.999Z`);
    }

    const [totals, byMonth, byPlan, outstanding] = await Promise.all([
        Payment.aggregate([
            { $match: match },
            { $group: { _id: "$currency", payments: { $sum: 1 }, grossMinor: { $sum: "$amountMinor" } } },
            { $sort: { grossMinor: -1 } }
        ]),
        Payment.aggregate([
            {
                $match: match
            },
            {
                $group: {
                    _id: { currency: "$currency", year: { $year: "$paidAt" }, month: { $month: "$paidAt" } },
                    payments: { $sum: 1 },
                    grossMinor: { $sum: "$amountMinor" }
                }
            },
            { $sort: { "_id.year": -1, "_id.month": -1 } },
            { $limit: 120 }
        ]),
        Payment.aggregate([
            {
                $match: match
            },
            {
                $group: {
                    _id: { planCode: "$planCode", currency: "$currency" },
                    payments: { $sum: 1 },
                    grossMinor: { $sum: "$amountMinor" }
                }
            },
            { $sort: { grossMinor: -1 } }
        ]),
        Payment.aggregate([
            { $match: { status: "pending" } },
            { $group: { _id: "$currency", payments: { $sum: 1 }, pendingMinor: { $sum: "$amountMinor" } } },
            { $sort: { pendingMinor: -1 } }
        ])
    ]);

    return {
        generatedAt: new Date(),
        range: { from: input.from ?? null, to: input.to ?? null },
        totals: totals.map((row) => ({
            currency: row._id,
            payments: row.payments,
            grossMinor: row.grossMinor
        })),
        byMonth: byMonth.map((row) => ({
            month: `${row._id.year}-${String(row._id.month).padStart(2, "0")}`,
            currency: row._id.currency,
            payments: row.payments,
            grossMinor: row.grossMinor
        })),
        byPlan: byPlan.map((row) => ({
            planCode: row._id.planCode ?? null,
            currency: row._id.currency,
            payments: row.payments,
            grossMinor: row.grossMinor
        })),
        outstanding: outstanding.map((row) => ({
            currency: row._id,
            payments: row.payments,
            pendingMinor: row.pendingMinor
        }))
    };
};
