import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import AuditLog from "../src/models/audit-log.model.js";
import Payment from "../src/models/payment.model.js";
import School from "../src/models/school.model.js";
import SubscriptionPlan from "../src/models/subscription-plan.model.js";
import { configurePaymentGatewayProvider } from "../src/services/payment-gateway.provider.js";
import {
    addBillingPeriod,
    createCheckout,
    handleGatewayWebhook,
    listPayments,
    listSchoolPayments,
    recordManualPayment,
    revenueReport
} from "../src/services/payment.service.js";

const objectId = () => new mongoose.Types.ObjectId();

const withMockedTransaction = (t) => {
    const transaction = {
        async withTransaction(callback) { return callback({}); },
        async endSession() {}
    };
    t.mock.method(mongoose, "startSession", async () => transaction);
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() { return this; });
};

const leanQuery = (result) => ({ lean: async () => result });
const pagedQuery = (result) => ({
    sort: () => ({ skip: () => ({ limit: () => leanQuery(result) }) })
});

test("billing periods advance by the plan interval", () => {
    const start = new Date("2026-01-15T00:00:00.000Z");
    assert.equal(addBillingPeriod("monthly", start).toISOString().slice(0, 10), "2026-02-15");
    assert.equal(addBillingPeriod("annual", start).toISOString().slice(0, 10), "2027-01-15");
});

test("checkout is unavailable until a payment gateway is configured", async () => {
    await assert.rejects(
        createCheckout({ user: { _id: objectId() } }, objectId(), { planId: objectId() }),
        { statusCode: 503 }
    );
});

test("school billing history is scoped to the authenticated school", async (t) => {
    const schoolId = objectId();
    let filter;
    t.mock.method(Payment, "find", (query) => {
        filter = query;
        return pagedQuery([]);
    });
    t.mock.method(Payment, "countDocuments", async () => 0);

    const result = await listSchoolPayments({ school: { _id: schoolId } }, {});

    assert.equal(String(filter.schoolId), String(schoolId));
    assert.deepEqual(result.items, []);
});

test("school billing history requires a tenant context", async () => {
    await assert.rejects(listSchoolPayments({ school: null }, {}), { statusCode: 403 });
});

test("platform payment listing supports school and status filters", async (t) => {
    const schoolId = objectId();
    let filter;
    t.mock.method(Payment, "find", (query) => {
        filter = query;
        return pagedQuery([]);
    });
    t.mock.method(Payment, "countDocuments", async () => 0);

    await listPayments({ schoolId: String(schoolId), status: "paid" });

    assert.equal(String(filter.schoolId), String(schoolId));
    assert.equal(filter.status, "paid");
});

test("revenue report aggregates recorded payments by currency, month, and plan", async (t) => {
    t.mock.method(Payment, "aggregate", (pipeline) => {
        const text = JSON.stringify(pipeline);
        if (text.includes("\"pending\"")) {
            return Promise.resolve([{ _id: "PKR", payments: 2, pendingMinor: 5000 }]);
        }
        if (text.includes("planCode")) {
            return Promise.resolve([
                { _id: { planCode: "basic", currency: "PKR" }, payments: 3, grossMinor: 9000 }
            ]);
        }
        if (text.includes("$month")) {
            return Promise.resolve([
                { _id: { currency: "PKR", year: 2026, month: 3 }, payments: 3, grossMinor: 9000 }
            ]);
        }
        return Promise.resolve([{ _id: "PKR", payments: 3, grossMinor: 9000 }]);
    });

    const report = await revenueReport({ from: "2026-01-01", to: "2026-03-31" });

    assert.deepEqual(report.totals, [{ currency: "PKR", payments: 3, grossMinor: 9000 }]);
    assert.deepEqual(report.byMonth, [{ month: "2026-03", currency: "PKR", payments: 3, grossMinor: 9000 }]);
    assert.deepEqual(report.byPlan, [{ planCode: "basic", currency: "PKR", payments: 3, grossMinor: 9000 }]);
    assert.deepEqual(report.outstanding, [{ currency: "PKR", payments: 2, pendingMinor: 5000 }]);
});

test("recording a manual payment without a plan requires an explicit amount", async (t) => {
    withMockedTransaction(t);
    const schoolId = objectId();
    const school = { _id: schoolId, subscription: {}, save: async () => {} };
    t.mock.method(School, "findById", () => ({ session: () => Promise.resolve(school) }));

    await assert.rejects(
        recordManualPayment({ user: { _id: objectId() } }, schoolId, { notes: "missing amount" }),
        { statusCode: 400 }
    );
});

test("recording a manual payment persists a paid manual record", async (t) => {
    withMockedTransaction(t);
    const schoolId = objectId();
    const school = { _id: schoolId, subscription: {}, save: async () => {} };
    t.mock.method(School, "findById", () => ({ session: () => Promise.resolve(school) }));
    let saved;
    t.mock.method(Payment.prototype, "save", async function savePayment() { saved = this; return this; });

    const payment = await recordManualPayment(
        { user: { _id: objectId() } },
        schoolId,
        { amountMinor: 150000, currency: "pkr", notes: "bank transfer" }
    );

    assert.equal(saved.status, "paid");
    assert.equal(saved.method, "manual");
    assert.equal(saved.amountMinor, 150000);
    assert.equal(saved.currency, "PKR");
    assert.equal(payment.status, "paid");
});

test("a configured gateway returns a checkout session for a paid plan", async (t) => {
    const schoolId = objectId();
    const planId = objectId();
    const school = { _id: schoolId, name: "Alpha School", email: "admin@alpha.example" };
    const plan = {
        _id: planId,
        code: "basic",
        name: "Basic",
        priceMinor: 250000,
        currency: "PKR",
        billingInterval: "monthly",
        isActive: true,
        isDefaultTrial: false
    };
    t.mock.method(School, "findById", () => leanQuery(school));
    t.mock.method(SubscriptionPlan, "findOne", () => leanQuery(plan));
    t.mock.method(Payment.prototype, "save", async function savePayment() { return this; });
    configurePaymentGatewayProvider({
        name: "test-gateway",
        async createCheckoutSession() {
            return { reference: "chk_123", url: "https://pay.example/checkout/chk_123" };
        },
        async verifyWebhook() { throw new Error("not used"); }
    });

    const result = await createCheckout({ user: { _id: objectId() } }, schoolId, { planId: String(planId) });

    assert.equal(result.checkoutUrl, "https://pay.example/checkout/chk_123");
    assert.equal(result.reference, "chk_123");
});

test("a repeated paid webhook is acknowledged without reprocessing", async (t) => {
    configurePaymentGatewayProvider({
        name: "test-gateway",
        async createCheckoutSession() { return {}; },
        async verifyWebhook() { return { reference: "chk_123", status: "paid" }; }
    });
    const paymentId = objectId();
    t.mock.method(Payment, "findOne", () => leanQuery({ _id: paymentId, status: "paid" }));

    const result = await handleGatewayWebhook({}, Buffer.from("{}"));

    assert.equal(result.alreadyProcessed, true);
    assert.equal(result.paymentId, String(paymentId));
});

test("a webhook with an unknown reference is rejected", async (t) => {
    configurePaymentGatewayProvider({
        name: "test-gateway",
        async createCheckoutSession() { return {}; },
        async verifyWebhook() { return { reference: "chk_missing", status: "paid" }; }
    });
    t.mock.method(Payment, "findOne", () => leanQuery(null));

    await assert.rejects(handleGatewayWebhook({}, Buffer.from("{}")), { statusCode: 404 });
});
