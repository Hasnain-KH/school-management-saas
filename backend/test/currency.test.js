import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateMoneyTotals,
  formatMoney,
  formatMoneyMajor,
  fromMinorUnits,
  getCurrencyConfig,
  getCurrencyFractionDigits,
  isSupportedCurrencyCode,
  parseMoneyInput,
  safelyRoundMoney,
  toMinorUnits,
  validateCurrencyCode
} from "../src/utils/currency.js";

test("currency registry includes required currencies and metadata", () => {
  for (const code of ["PKR", "USD", "GBP", "EUR", "AED", "SAR", "INR", "BDT", "CAD", "AUD"]) {
    const cfg = getCurrencyConfig(code);
    assert.ok(cfg, code);
    assert.equal(cfg.code, code);
    assert.equal(typeof cfg.name, "string");
    assert.equal(typeof cfg.symbol, "string");
    assert.equal(typeof cfg.fractionDigits, "number");
  }
  assert.equal(getCurrencyConfig("PKR").fractionDigits, 2);
  assert.equal(getCurrencyConfig("USD").fractionDigits, 2);
  assert.equal(getCurrencyConfig("JPY").fractionDigits, 0);
  assert.equal(getCurrencyConfig("KWD").fractionDigits, 3);
});

test("validateCurrencyCode accepts supported ISO codes and rejects unsupported", () => {
  assert.equal(validateCurrencyCode("usd"), "USD");
  assert.equal(isSupportedCurrencyCode("pkr"), true);
  assert.equal(isSupportedCurrencyCode("ZZZ"), false);
  assert.throws(() => validateCurrencyCode("ZZZ"), /Unsupported currency code/);
});

test("minor-unit conversion is currency-aware and avoids float artifacts", () => {
  assert.equal(toMinorUnits(12.34, "USD"), 1234);
  assert.equal(fromMinorUnits(1234, "USD"), 12.34);
  assert.equal(toMinorUnits(1234, "JPY"), 1234);
  assert.equal(fromMinorUnits(1234, "JPY"), 1234);
  assert.equal(toMinorUnits(12.345, "KWD"), 12345);
  assert.equal(fromMinorUnits(12345, "KWD"), 12.345);
  // classic float case
  assert.equal(toMinorUnits(0.1 + 0.2, "USD"), 30);
});

test("money helpers round safely and total as integers", () => {
  assert.equal(safelyRoundMoney(10.2), 10);
  assert.equal(calculateMoneyTotals([100, 250, 50]), 400);
  assert.throws(() => safelyRoundMoney(Number.NaN), /Invalid money amount/);
});

test("parseMoneyInput handles currency precision", () => {
  assert.equal(parseMoneyInput("12.34", "USD"), 1234);
  assert.equal(parseMoneyInput("12", "JPY"), 12);
  assert.equal(parseMoneyInput("12.345", "KWD"), 12345);
  assert.equal(parseMoneyInput("", "USD"), null);
  assert.throws(() => parseMoneyInput("12.34", "JPY"), /Invalid|precision|decimal/i);
});

test("formatMoney and formatMoneyMajor include currency code awareness", () => {
  const usd = formatMoney(1234, "USD", "en-US");
  assert.match(usd, /12\.34/);
  const jpy = formatMoney(1234, "JPY", "en-US");
  assert.match(jpy, /1,234|1234/);
  const major = formatMoneyMajor(12.34, "USD", "en-US");
  assert.match(major, /12\.34/);
});

test("BHD/OMR/JOD use 3 decimal places like KWD", () => {
  for (const code of ["BHD", "OMR", "JOD"]) {
    assert.equal(getCurrencyFractionDigits(code), 3);
    assert.equal(toMinorUnits(1.234, code), 1234);
    assert.equal(fromMinorUnits(1234, code), 1.234);
    assert.equal(parseMoneyInput("1.234", code), 1234);
    assert.throws(() => parseMoneyInput("1.2345", code), /decimal/i);
  }
});

test("money calculations stay exact in minor units (no float loss)", () => {
  // additions/subtractions
  assert.equal(calculateMoneyTotals([toMinorUnits(0.1, "USD"), toMinorUnits(0.2, "USD")]), 30);
  assert.equal(toMinorUnits(19.99, "USD") + toMinorUnits(0.01, "USD"), 2000);
  // discount: 10% of 9999 minor units = 1000 (rounded half-up)
  const gross = 9999;
  const discount = Math.round(gross * 1000 / 10000);
  assert.equal(gross - discount, 8999);
  // KWD exact
  assert.equal(toMinorUnits(1.005, "KWD"), 1005);
  assert.equal(calculateMoneyTotals([1005, 2005]), 3010);
});

test("formatMoney supports exponent override for legacy records", () => {
  // legacy hundredths stored as 250000 meaning 2500.00
  const legacy = formatMoney(250000, "USD", "en-US", 2);
  assert.match(legacy, /2,500\.00|2500\.00/);
});
