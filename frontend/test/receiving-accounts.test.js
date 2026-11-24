import assert from "node:assert/strict";
import test from "node:test";
import {
  MANUAL_PAYMENT_STEPS,
  accountInstructionText,
  accountTypeLabel,
  copyableAccountDetails
} from "../src/utils/receiving-accounts.js";

const account = {
  accountType: "bank_account",
  providerName: "Example Bank",
  accountTitle: "SchoolFlow Platform",
  accountNumber: "1234 5678",
  iban: "PK36 SCBL 0000 0011 2345 6702",
  mobileWalletNumber: null,
  instructions: "Include your school name as the reference."
};

test("receiving account types use human-readable labels", () => {
  assert.equal(accountTypeLabel("bank_account"), "Bank account");
  assert.equal(accountTypeLabel("jazzcash"), "JazzCash");
  assert.equal(accountTypeLabel("easypaisa"), "Easypaisa");
  assert.equal(accountTypeLabel("other"), "Other method");
  assert.equal(accountTypeLabel(undefined), "—");
});

test("copyable details expose only reference values", () => {
  assert.deepEqual(copyableAccountDetails(account), [
    { label: "Account number", value: "1234 5678" },
    { label: "IBAN", value: "PK36 SCBL 0000 0011 2345 6702" }
  ]);
  const wallet = { ...account, accountType: "easypaisa", accountNumber: "", iban: null, mobileWalletNumber: "0300 1234567" };
  assert.deepEqual(copyableAccountDetails(wallet), [
    { label: "Mobile wallet number", value: "0300 1234567" }
  ]);
  assert.deepEqual(copyableAccountDetails(null), []);
});

test("instructions never imply an in-app payment or automatic activation", () => {
  const text = accountInstructionText(account);
  assert.match(text, /outside|Pay to/);
  assert.doesNotMatch(text.toLowerCase(), /gateway|checkout|automatically activate/);
  assert.equal(MANUAL_PAYMENT_STEPS.length, 4);
  assert.match(MANUAL_PAYMENT_STEPS[2], /verifies the payment independently/);
  assert.match(MANUAL_PAYMENT_STEPS[3], /manually activates or renews/);
});
