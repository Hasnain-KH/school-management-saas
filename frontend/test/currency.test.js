import assert from "node:assert/strict";
import test from "node:test";
import { parseMoneyInput, toMinorUnits } from "../src/utils/currency.js";

test("numeric money conversion rounds half-up without binary float artifacts", () => {
  assert.equal(toMinorUnits(8.575, "USD"), 858);
  assert.equal(toMinorUnits(10.075, "USD"), 1008);
  assert.equal(toMinorUnits(0.1 + 0.2, "USD"), 30);
  assert.equal(toMinorUnits(12.345, "KWD"), 12345);
});

test("numeric money input still rejects excess precision", () => {
  assert.throws(() => parseMoneyInput(8.575, "USD"), /decimal place/i);
  assert.equal(parseMoneyInput("8.57", "USD"), 857);
});
