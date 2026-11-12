import SubscriptionPlan from "../models/subscription-plan.model.js";

const ALL_FEATURES = {
    academics: true,
    students: true,
    staff: true,
    attendance: true,
    fees: true,
    exams: true,
    calendar: true,
    inventory: true,
    library: true,
    notifications: true,
    reports: true
};

const coreFeatures = (overrides = {}) => ({
    academics: true,
    students: true,
    staff: true,
    attendance: true,
    fees: true,
    exams: true,
    calendar: false,
    inventory: false,
    library: false,
    notifications: true,
    reports: true,
    ...overrides
});

// Sensible commercial defaults for private schools in Pakistan (PKR).
// Prices are stored in minor units (paisa). Adjust per your own pricing.
export const DEFAULT_PLANS = [
    {
        code: "trial",
        name: "Free Trial",
        description: "14-day full-access trial for evaluating SchoolFlow.",
        priceMinor: 0,
        currency: "PKR",
        billingInterval: "monthly",
        trialDurationDays: 14,
        limits: { students: 300, staff: 50, branches: 1 },
        features: { ...ALL_FEATURES },
        isActive: true,
        isDefaultTrial: true
    },
    {
        code: "basic",
        name: "Basic",
        description: "Core school operations for a single campus.",
        priceMinor: 500000,
        currency: "PKR",
        billingInterval: "monthly",
        trialDurationDays: null,
        limits: { students: 300, staff: 40, branches: 1 },
        features: coreFeatures(),
        isActive: true,
        isDefaultTrial: false
    },
    {
        code: "standard",
        name: "Standard",
        description: "Full operations with library, inventory, and calendar.",
        priceMinor: 1200000,
        currency: "PKR",
        billingInterval: "monthly",
        trialDurationDays: null,
        limits: { students: 1000, staff: 150, branches: 3 },
        features: { ...ALL_FEATURES },
        isActive: true,
        isDefaultTrial: false
    },
    {
        code: "premium",
        name: "Premium",
        description: "Unlimited students and staff for multi-campus groups.",
        priceMinor: 10000000,
        currency: "PKR",
        billingInterval: "annual",
        trialDurationDays: null,
        limits: { students: null, staff: null, branches: null },
        features: { ...ALL_FEATURES },
        isActive: true,
        isDefaultTrial: false
    }
];

// Idempotently ensures the default plans exist. Existing plans are never overwritten
// (so an operator's pricing edits are preserved); only missing codes are created.
export const seedDefaultSubscriptionPlans = async () => {
    const existing = await SubscriptionPlan.find({ code: { $in: DEFAULT_PLANS.map((plan) => plan.code) } })
        .select("code")
        .lean();
    const existingCodes = new Set(existing.map(({ code }) => code));
    const created = [];
    for (const plan of DEFAULT_PLANS) {
        if (existingCodes.has(plan.code)) continue;
        created.push(plan.code);
        await SubscriptionPlan.create(plan);
    }
    return { created, skipped: [...existingCodes] };
};

export const hasDefaultTrialPlan = async () =>
    Boolean(await SubscriptionPlan.exists({ isActive: true, isDefaultTrial: true }));

// Opt-in startup seeding (SEED_DEFAULT_PLANS=true). Safe to call on every cold
// start: it no-ops when a default trial plan already exists.
export const maybeAutoSeedDefaultPlans = async () => {
    if (process.env.SEED_DEFAULT_PLANS !== "true") return null;
    try {
        if (await hasDefaultTrialPlan()) return null;
        const result = await seedDefaultSubscriptionPlans();
        if (result.created.length) {
            console.info(`Seeded default subscription plans: ${result.created.join(", ")}`);
        }
        return result;
    } catch (error) {
        console.error("Automatic subscription plan seeding failed", error.name ?? "Error");
        return null;
    }
};
