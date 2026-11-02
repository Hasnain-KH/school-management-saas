import assert from "node:assert/strict";
import test from "node:test";
import { buildFeeAssignmentPayload, buildVoucherGenerationPayload } from "../src/utils/finance-workflows.js";

test("fee assignment payload omits blank optional discounts and tenant fields", () => {
  const payload = buildFeeAssignmentPayload({
    studentId: "student-id", feeStructureId: "structure-id", startPeriod: "2026-09", endPeriod: "",
    discountAmountMinor: "", discountBasisPoints: "", scholarshipName: ""
  });
  assert.deepEqual(payload, {
    studentId: "student-id", feeStructureId: "structure-id", startPeriod: "2026-09"
  });
  assert.equal("schoolId" in payload, false);
  assert.equal("role" in payload, false);
});

test("fee assignment rejects simultaneous discounts and invalid ranges", () => {
  assert.throws(() => buildFeeAssignmentPayload({
    studentId: "s", feeStructureId: "f", startPeriod: "2026-01",
    discountAmountMinor: "100", discountBasisPoints: "100"
  }), /either a fixed discount/);
  assert.throws(() => buildFeeAssignmentPayload({
    studentId: "s", feeStructureId: "f", startPeriod: "2026-12", endPeriod: "2026-01"
  }), /End period/);
});

test("voucher payload deduplicates selected ids and validates period and count", () => {
  assert.deepEqual(buildVoucherGenerationPayload({
    feeStructureId: "structure-id", period: "2026-09", studentIds: ["s1", "s1", "s2"]
  }), { feeStructureId: "structure-id", period: "2026-09", studentIds: ["s1", "s2"] });
  assert.throws(() => buildVoucherGenerationPayload({
    feeStructureId: "structure-id", period: "2026-13", studentIds: ["s1"]
  }), /YYYY-MM/);
});
