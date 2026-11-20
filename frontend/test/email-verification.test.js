import assert from "node:assert/strict";
import test from "node:test";
import {
  VERIFICATION_OUTCOMES,
  buildResendVerificationPayload,
  buildVerificationConfirmBody,
  isVerificationRequiredError,
  validateNewPassword,
  verificationMessage,
  verificationOutcome
} from "../src/utils/email-verification.js";

test("verification outcomes map HTTP statuses to distinct, actionable states", () => {
  assert.equal(verificationOutcome(200), VERIFICATION_OUTCOMES.SUCCESS);
  assert.equal(verificationOutcome(204), VERIFICATION_OUTCOMES.SUCCESS);
  assert.equal(verificationOutcome(409), VERIFICATION_OUTCOMES.ALREADY_VERIFIED);
  assert.equal(verificationOutcome(400), VERIFICATION_OUTCOMES.INVALID);
  assert.equal(verificationOutcome(429), VERIFICATION_OUTCOMES.RATE_LIMITED);
  assert.equal(verificationOutcome(500), VERIFICATION_OUTCOMES.SERVER_ERROR);
  assert.equal(verificationOutcome(503), VERIFICATION_OUTCOMES.SERVER_ERROR);
  assert.equal(verificationOutcome(undefined), VERIFICATION_OUTCOMES.UNKNOWN);
  assert.equal(verificationOutcome("400"), VERIFICATION_OUTCOMES.UNKNOWN);
});

test("every outcome resolves to a non-empty user-facing message", () => {
  for (const outcome of Object.values(VERIFICATION_OUTCOMES)) {
    const message = verificationMessage(outcome);
    assert.equal(typeof message, "string");
    assert.ok(message.length > 0);
  }
  assert.equal(
    verificationMessage("not-a-real-outcome"),
    verificationMessage(VERIFICATION_OUTCOMES.UNKNOWN)
  );
});

test("the confirmation body never leaks or coerces the token", () => {
  assert.deepEqual(buildVerificationConfirmBody("abc123"), { token: "abc123" });
  assert.deepEqual(buildVerificationConfirmBody(undefined), { token: "" });
  assert.deepEqual(buildVerificationConfirmBody(42), { token: "" });
});

test("resend payload targets the verification endpoint and omits a blank workspace", () => {
  assert.deepEqual(buildResendVerificationPayload({ email: " user@school.edu ", schoolSlug: " northstar " }), {
    endpoint: "/auth/email-verification",
    body: { email: "user@school.edu", schoolSlug: "northstar" }
  });
  assert.deepEqual(buildResendVerificationPayload({ email: "admin@platform.test" }), {
    endpoint: "/auth/email-verification",
    body: { email: "admin@platform.test" }
  });
  assert.deepEqual(buildResendVerificationPayload(), {
    endpoint: "/auth/email-verification",
    body: { email: "" }
  });
});

test("new password validation enforces length and confirmation", () => {
  assert.equal(validateNewPassword("short", "short"), "Password must be at least 12 characters.");
  assert.equal(validateNewPassword("a-long-enough-password", "different-password-x"), "The passwords do not match.");
  assert.equal(validateNewPassword("a-long-enough-password", "a-long-enough-password"), null);
});

test("verification-required errors are distinguished from expired sessions", () => {
  assert.equal(isVerificationRequiredError({ status: 403, message: "Email address verification is required" }), true);
  assert.equal(isVerificationRequiredError({ status: 401, message: "Session expired" }), false);
  assert.equal(isVerificationRequiredError({ status: 403, message: "Forbidden" }), false);
  assert.equal(isVerificationRequiredError(undefined), false);
});
