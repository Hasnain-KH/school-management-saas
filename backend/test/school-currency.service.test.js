import assert from "node:assert/strict";
import test, { mock } from "node:test";
import mongoose from "mongoose";

mock.module("../src/utils/audit.js", { namedExports: { writeAuditLog: async () => {} } });

const { default: School } = await import("../src/models/school.model.js");
const { default: FeePayment } = await import("../src/models/fee-payment.model.js");
const { default: FeeVoucher } = await import("../src/models/fee-voucher.model.js");
const { default: FeeStructure } = await import("../src/models/fee-structure.model.js");
const { default: StudentFeeAssignment } = await import("../src/models/student-fee-assignment.model.js");
const { default: FixedAsset } = await import("../src/models/fixed-asset.model.js");
const { default: FixedAssetDepreciation } = await import("../src/models/fixed-asset-depreciation.model.js");
const { configureSchoolCurrency, detectFinancialScaleConflicts, getSchoolCurrencySettings } = await import("../src/services/school.service.js");

const SCHOOL_A = "64a000000000000000000001";
const SCHOOL_B = "64a000000000000000000002";
const USER_A = "64a000000000000000000011";

function mockSession() {
  return {
    withTransaction: async (fn) => fn(),
    endSession: async () => {}
  };
}

function baseReq(overrides = {}) {
  return {
    user: { _id: USER_A, schoolId: SCHOOL_A, role: "school_admin" },
    school: { _id: SCHOOL_A, baseCurrency: null, currencyConfigurationStatus: "unconfigured" },
    ...overrides
  };
}

function mockNoScaleConflicts(t) {
  t.mock.method(FeeStructure, "exists", async () => null);
  t.mock.method(StudentFeeAssignment, "exists", async () => null);
}

test("unsupported currency codes are rejected", async (t) => {
  t.mock.method(mongoose, "startSession", async () => mockSession());
  await assert.rejects(
    configureSchoolCurrency(baseReq(), { baseCurrency: "ZZZ", confirmation: true }),
    (err) => err.statusCode === 400 && /Unsupported currency code/.test(err.message)
  );
});

test("new school configures PKR and USD independently (configurable per school)", async (t) => {
  t.mock.method(mongoose, "startSession", async () => mockSession());
  const saved = [];
  const schoolDoc = {
    _id: SCHOOL_A, baseCurrency: null, currencyConfigurationStatus: "unconfigured",
    save: async function() { saved.push({ ...this }); return this; }
  };
  t.mock.method(School, "findById", () => ({ session: async () => schoolDoc }));
  t.mock.method(FeePayment, "exists", async () => null);
  t.mock.method(FeeVoucher, "exists", async () => null);
  t.mock.method(FixedAsset, "exists", async () => null);
  t.mock.method(FixedAssetDepreciation, "exists", async () => null);
  mockNoScaleConflicts(t);

  const result = await configureSchoolCurrency(baseReq(), { baseCurrency: "PKR", confirmation: true });
  assert.equal(result.baseCurrency, "PKR");
  assert.equal(result.currencyConfigurationStatus, "configured");
  assert.ok(result.currencyConfiguredAt);
  assert.equal(String(result.currencyConfiguredBy), USER_A);
});

test("existing school with financial transactions requires explicit acknowledgement and does not convert amounts", async (t) => {
  t.mock.method(mongoose, "startSession", async () => mockSession());
  const schoolDoc = {
    _id: SCHOOL_A, baseCurrency: null, currencyConfigurationStatus: "unconfigured",
    save: async function() { return this; }
  };
  t.mock.method(School, "findById", () => ({ session: async () => schoolDoc }));
  const paymentExists = async (q) => (q && (q.currencyExponent || q.$or)) ? null : { _id: "x" };
  t.mock.method(FeePayment, "exists", paymentExists);
  t.mock.method(FeeVoucher, "exists", async () => null);
  t.mock.method(FixedAsset, "exists", async () => null);
  t.mock.method(FixedAssetDepreciation, "exists", async () => null);
  t.mock.method(FeeStructure, "exists", async () => null);
  t.mock.method(StudentFeeAssignment, "exists", async () => null);

  await assert.rejects(
    configureSchoolCurrency(baseReq(), { baseCurrency: "USD", confirmation: true }),
    (err) => err.statusCode === 400 && /explicit confirmation/i.test(err.message)
  );

  const ok = await configureSchoolCurrency(baseReq(), { baseCurrency: "USD", confirmation: true, acknowledgedExistingAmounts: true });
  assert.equal(ok.baseCurrency, "USD");
  assert.equal(ok.currencyConfigurationStatus, "configured");
});

test("configured currency is locked when financial transactions exist", async (t) => {
  t.mock.method(mongoose, "startSession", async () => mockSession());
  const schoolDoc = {
    _id: SCHOOL_A, baseCurrency: "PKR", currencyConfigurationStatus: "configured",
    save: async function() { return this; }
  };
  t.mock.method(School, "findById", () => ({ session: async () => schoolDoc }));
  t.mock.method(FeePayment, "exists", async () => ({ _id: "x" }));
  t.mock.method(FeeVoucher, "exists", async () => null);
  t.mock.method(FixedAsset, "exists", async () => null);
  t.mock.method(FixedAssetDepreciation, "exists", async () => null);
  mockNoScaleConflicts(t);

  await assert.rejects(
    configureSchoolCurrency(baseReq({ school: { _id: SCHOOL_A, baseCurrency: "PKR", currencyConfigurationStatus: "configured" } }), { baseCurrency: "USD", confirmation: true }),
    (err) => err.statusCode === 409 && /locked/i.test(err.message)
  );
});

test("currency settings resolve from authenticated tenant context and report lock state", async (t) => {
  t.mock.method(School, "findById", () => ({ lean: async () => ({ _id: SCHOOL_A, baseCurrency: "USD", currencyConfigurationStatus: "configured", currencyConfiguredAt: new Date("2026-01-01T00:00:00Z"), currencyConfiguredBy: USER_A }) }));
  t.mock.method(FeePayment, "exists", async () => null);
  t.mock.method(FeeVoucher, "exists", async () => null);
  t.mock.method(FixedAsset, "exists", async () => null);
  t.mock.method(FixedAssetDepreciation, "exists", async () => null);
  mockNoScaleConflicts(t);

  const settings = await getSchoolCurrencySettings(baseReq({ school: { _id: SCHOOL_A, baseCurrency: "USD", currencyConfigurationStatus: "configured" } }));
  assert.equal(settings.baseCurrency, "USD");
  assert.equal(settings.currency.code, "USD");
  assert.equal(settings.locked, false);
  assert.equal(settings.canChange, true);
});

test("cross-tenant mismatch is rejected by currency settings", async () => {
  await assert.rejects(
    getSchoolCurrencySettings(baseReq({ school: { _id: SCHOOL_B } })),
    (err) => err.statusCode === 403
  );
});

test("currency assignment fails closed when legacy hundredths records would be misinterpreted by a non-2-decimal currency", async (t) => {
  t.mock.method(mongoose, "startSession", async () => mockSession());
  const schoolDoc = {
    _id: SCHOOL_A, baseCurrency: null, currencyConfigurationStatus: "unconfigured",
    save: async function() { throw new Error("should not save"); }
  };
  t.mock.method(School, "findById", () => ({ session: async () => schoolDoc }));
  t.mock.method(FeePayment, "exists", async () => ({ _id: "legacy" }));
  t.mock.method(FeeVoucher, "exists", async () => null);
  t.mock.method(FeeStructure, "exists", async () => null);
  t.mock.method(StudentFeeAssignment, "exists", async () => null);
  t.mock.method(FixedAsset, "exists", async () => null);
  t.mock.method(FixedAssetDepreciation, "exists", async () => null);

  await assert.rejects(
    configureSchoolCurrency(baseReq(), { baseCurrency: "JPY", confirmation: true, acknowledgedExistingAmounts: true }),
    (err) => err.statusCode === 409 && /different money scale/i.test(err.message)
  );
  await assert.rejects(
    configureSchoolCurrency(baseReq(), { baseCurrency: "KWD", confirmation: true, acknowledgedExistingAmounts: true }),
    (err) => err.statusCode === 409 && /different money scale/i.test(err.message)
  );
});

test("detectFinancialScaleConflicts treats missing exponent as legacy hundredths (2)", async (t) => {
  t.mock.method(FeePayment, "exists", async () => null);
  t.mock.method(FeeVoucher, "exists", async () => null);
  t.mock.method(FeeStructure, "exists", async () => null);
  t.mock.method(StudentFeeAssignment, "exists", async () => null);
  t.mock.method(FixedAsset, "exists", async () => null);
  t.mock.method(FixedAssetDepreciation, "exists", async () => null);
  assert.deepEqual(await detectFinancialScaleConflicts(SCHOOL_A, 2), []);

  let assignmentQuery;
  t.mock.restoreAll();
  t.mock.method(FeePayment, "exists", async () => null);
  t.mock.method(FeeVoucher, "exists", async () => null);
  t.mock.method(FeeStructure, "exists", async () => null);
  t.mock.method(StudentFeeAssignment, "exists", async (query) => { assignmentQuery = query; return null; });
  t.mock.method(FixedAsset, "exists", async () => null);
  t.mock.method(FixedAssetDepreciation, "exists", async () => null);
  assert.deepEqual(await detectFinancialScaleConflicts(SCHOOL_A, 2), []);
  assert.deepEqual(assignmentQuery.currencyExponent.$nin, [2, null]);

  t.mock.restoreAll();
  t.mock.method(FeePayment, "exists", async () => ({ _id: "legacy" }));
  t.mock.method(FeeVoucher, "exists", async () => null);
  t.mock.method(FeeStructure, "exists", async () => null);
  t.mock.method(StudentFeeAssignment, "exists", async () => null);
  t.mock.method(FixedAsset, "exists", async () => null);
  t.mock.method(FixedAssetDepreciation, "exists", async () => null);
  const conflicts = await detectFinancialScaleConflicts(SCHOOL_A, 0);
  assert.ok(conflicts.includes("fee_payment"));
});
