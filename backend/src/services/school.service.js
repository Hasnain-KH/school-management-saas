import mongoose from "mongoose";
import School from "../models/school.model.js";
import SubscriptionPlan from "../models/subscription-plan.model.js";
import Student from "../models/student.model.js";
import User from "../models/user.model.js";
import FeePayment from "../models/fee-payment.model.js";
import FeeVoucher from "../models/fee-voucher.model.js";
import FeeStructure from "../models/fee-structure.model.js";
import StudentFeeAssignment from "../models/student-fee-assignment.model.js";
import FixedAsset from "../models/fixed-asset.model.js";
import FixedAssetDepreciation from "../models/fixed-asset-depreciation.model.js";
import { writeAuditLog } from "../utils/audit.js";
import { getCurrencyConfig, getCurrencyFractionDigits, listSupportedCurrencies, validateCurrencyCode } from "../utils/currency.js";
import { HttpError } from "../utils/http-error.js";

export const getSchoolProfile = (req) => School.findById(req.school._id);

export const getSchoolSubscriptionSummary = async (req) => {
    if (!req.school?._id || String(req.school._id) !== String(req.user?.schoolId)) {
        return null;
    }
    const school = await School.findOne({ _id: req.school._id }).lean();
    if (!school) return null;
    const plan = school.subscription?.planId
        ? await SubscriptionPlan.findById(school.subscription.planId).lean()
        : school.subscription?.plan
            ? await SubscriptionPlan.findOne({ code: school.subscription.plan }).lean()
            : null;
    const [students, staff] = await Promise.all([
        Student.countDocuments({ schoolId: school._id }),
        User.countDocuments({
            schoolId: school._id,
            role: { $in: ["school_admin", "principal", "teacher"] },
            status: "active"
        })
    ]);
    return {
        status: school.status,
        subscription: school.subscription,
        plan: plan ? {
            name: plan.name,
            code: plan.code,
            priceMinor: plan.priceMinor,
            currency: plan.currency,
            billingInterval: plan.billingInterval,
            limits: plan.limits,
            features: plan.features
        } : null,
        usage: { students, staff, branches: school.branches.length },
        asOf: new Date()
    };
};

export const updateSchoolProfile = async (req, input) => {
    const updates = {};
    for (const key of ["name", "phone"]) {
        if (input[key] !== undefined) {
            updates[key] = input[key];
        }
    }
    if (input.address) {
        for (const [key, value] of Object.entries(input.address)) {
            updates[`address.${key}`] = value;
        }
    }
    if (input.settings?.attendanceLateGraceMinutes !== undefined) {
        updates["settings.attendanceLateGraceMinutes"] = input.settings.attendanceLateGraceMinutes;
    }
    if (input.settings?.attendanceStartTime !== undefined) {
        updates["settings.attendanceStartTime"] = input.settings.attendanceStartTime;
    }

    const session = await mongoose.startSession();
    let school;
    try {
        await session.withTransaction(async () => {
            school = await School.findOneAndUpdate(
                { _id: req.school._id },
                { $set: updates },
                { new: true, runValidators: true, session }
            );
            if (school) {
                await writeAuditLog({
                    schoolId: school._id,
                    actorUserId: req.user._id,
                    action: "school.profile.updated",
                    resourceType: "school",
                    resourceId: school._id,
                    metadata: { fields: Object.keys(input) },
                    session
                });
            }
        });
    } finally {
        await session.endSession();
    }
    return school;
};
export const listCurrencies = () => listSupportedCurrencies();

const FINANCIAL_SCALE_MODELS = [
    ["fee_structure", FeeStructure],
    ["fee_voucher", FeeVoucher],
    ["fee_payment", FeePayment],
    ["fixed_asset", FixedAsset],
    ["fixed_asset_depreciation", FixedAssetDepreciation],
    ["student_fee_assignment", StudentFeeAssignment]
];

const existsForSchool = (Model, query, session) => {
    const result = Model.exists(query);
    // A session-bound query must be serial: a ClientSession allows only one
    // in-flight operation at a time. Plain async mocks in tests have no session().
    if (session && result && typeof result.session === "function") result.session(session);
    return result;
};

export const schoolHasFinancialTransactions = async (schoolId, session = null) => {
    if (session) {
        for (const [, Model] of FINANCIAL_SCALE_MODELS) {
            if (await existsForSchool(Model, { schoolId }, session)) return true;
        }
        return false;
    }
    const found = await Promise.all(
        FINANCIAL_SCALE_MODELS.map(([, Model]) => existsForSchool(Model, { schoolId }, null))
    );
    return found.some(Boolean);
};

// Historical monetary records before currency hardening were stored as integer hundredths (exponent 2).
// If a record has no currencyExponent, treat it as legacy exponent 2. Any mismatch with the target
// currency exponent means reinterpreting stored amounts would change economic value - fail closed.
export const detectFinancialScaleConflicts = async (schoolId, targetExponent, session = null) => {
    const conflicts = [];
    for (const [name, Model] of FINANCIAL_SCALE_MODELS) {
        // A null exponent on fee assignments means "inherit the fee structure exponent",
        // which was 2 for legacy hundredths records. It is safe for exponent-2 currencies.
        const mismatchQuery = targetExponent === 2
            ? { schoolId, currencyExponent: { $exists: true, $nin: [2, null] } }
            : { schoolId, $or: [{ currencyExponent: { $exists: false } }, { currencyExponent: { $ne: targetExponent } }] };
        if (await existsForSchool(Model, mismatchQuery, session)) conflicts.push(name);
    }
    return conflicts;
};

export const getSchoolCurrencySettings = async (req) => {
    if (!req.school?._id || String(req.school._id) !== String(req.user?.schoolId)) {
        throw new HttpError(403, "A matching school tenant context is required");
    }
    const school = await School.findById(req.school._id).lean();
    if (!school) throw new HttpError(404, "School was not found");
    const hasTransactions = await schoolHasFinancialTransactions(school._id);
    const currency = getCurrencyConfig(school.baseCurrency);
    return {
        baseCurrency: school.baseCurrency || null,
        currency: currency ? { code: currency.code, name: currency.name, symbol: currency.symbol, fractionDigits: currency.fractionDigits } : null,
        currencyConfiguredAt: school.currencyConfiguredAt || null,
        currencyConfiguredBy: school.currencyConfiguredBy ? String(school.currencyConfiguredBy) : null,
        currencyConfigurationStatus: school.currencyConfigurationStatus || "unconfigured",
        hasFinancialTransactions: hasTransactions,
        locked: Boolean(school.baseCurrency) && hasTransactions,
        canChange: !school.baseCurrency || !hasTransactions
    };
};

export const configureSchoolCurrency = async (req, input) => {
    if (!req.school?._id || String(req.school._id) !== String(req.user?.schoolId)) {
        throw new HttpError(403, "A matching school tenant context is required");
    }
    if (!["school_admin", "principal"].includes(req.user.role)) {
        throw new HttpError(403, "Only an authorized school administrator can configure currency");
    }
    const baseCurrency = validateCurrencyCode(input.baseCurrency);
    const session = await mongoose.startSession();
    let school;
    try {
        await session.withTransaction(async () => {
            school = await School.findById(req.school._id).session(session);
            if (!school) throw new HttpError(404, "School was not found");

            const hasTransactions = await schoolHasFinancialTransactions(school._id, session);
            const previousCurrency = school.baseCurrency || null;
            const wasConfigured = school.currencyConfigurationStatus === "configured" && Boolean(school.baseCurrency);
            const targetExponent = getCurrencyFractionDigits(baseCurrency);
            const scaleConflicts = await detectFinancialScaleConflicts(school._id, targetExponent, session);

            if (wasConfigured && hasTransactions) {
                throw new HttpError(409, "Base currency is locked because financial transactions already exist. Historical amounts cannot be silently reinterpreted.");
            }
            if (wasConfigured && previousCurrency === baseCurrency) {
                return; // no-op
            }
            if (scaleConflicts.length > 0) {
                throw new HttpError(409, `Currency cannot be assigned because existing financial records (${scaleConflicts.join(", ")}) use a different money scale than ${baseCurrency} (exponent ${targetExponent}). Historical amounts cannot be safely reinterpreted; an explicit audited migration is required.`);
            }
            if (!wasConfigured && hasTransactions && input.acknowledgedExistingAmounts !== true) {
                throw new HttpError(400, "Explicit confirmation is required: this assigns the selected currency to existing amounts already recorded. No amounts will be converted or recalculated.");
            }

            school.baseCurrency = baseCurrency;
            school.baseCurrencyExponent = targetExponent;
            school.currencyConfiguredAt = new Date();
            school.currencyConfiguredBy = req.user._id;
            school.currencyConfigurationStatus = "configured";
            await school.save({ session });

            await writeAuditLog({
                schoolId: school._id,
                actorUserId: req.user._id,
                action: wasConfigured ? "school.currency.changed" : "school.currency.configured",
                resourceType: "school",
                resourceId: school._id,
                metadata: {
                    previousCurrency,
                    newCurrency: baseCurrency,
                    hasFinancialTransactions: hasTransactions,
                    acknowledgedExistingAmounts: input.acknowledgedExistingAmounts === true
                },
                session
            });
        });
    } finally {
        await session.endSession();
    }
    return school;
};
