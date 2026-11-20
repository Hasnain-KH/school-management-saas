// Pure helpers for the email verification and password recovery flows. Kept
// free of React so they can be covered by the repository's node --test suite.

export const VERIFICATION_OUTCOMES = {
  SUCCESS: "success",
  ALREADY_VERIFIED: "already_verified",
  INVALID: "invalid",
  RATE_LIMITED: "rate_limited",
  SERVER_ERROR: "server_error",
  MISSING: "missing",
  UNKNOWN: "unknown"
};

const VERIFICATION_MESSAGES = {
  [VERIFICATION_OUTCOMES.SUCCESS]: "Your email address is verified. You can now sign in.",
  [VERIFICATION_OUTCOMES.ALREADY_VERIFIED]: "This email address is already verified. You can sign in.",
  [VERIFICATION_OUTCOMES.INVALID]: "This verification link is invalid or has expired. Request a new one below.",
  [VERIFICATION_OUTCOMES.RATE_LIMITED]: "Too many attempts. Please wait a few minutes and try again.",
  [VERIFICATION_OUTCOMES.SERVER_ERROR]: "The service could not complete verification right now. Please try again shortly.",
  [VERIFICATION_OUTCOMES.MISSING]: "This verification link is missing its token. Request a new verification email below.",
  [VERIFICATION_OUTCOMES.UNKNOWN]: "We could not verify this link. Request a new verification email below."
};

// Maps an HTTP status (or a missing one) to a user-facing outcome. Never throws.
export function verificationOutcome(status) {
  if (typeof status !== "number") return VERIFICATION_OUTCOMES.UNKNOWN;
  if (status >= 200 && status < 300) return VERIFICATION_OUTCOMES.SUCCESS;
  if (status === 409) return VERIFICATION_OUTCOMES.ALREADY_VERIFIED;
  if (status === 400) return VERIFICATION_OUTCOMES.INVALID;
  if (status === 429) return VERIFICATION_OUTCOMES.RATE_LIMITED;
  if (status >= 500) return VERIFICATION_OUTCOMES.SERVER_ERROR;
  return VERIFICATION_OUTCOMES.UNKNOWN;
}

export function verificationMessage(outcome) {
  return VERIFICATION_MESSAGES[outcome] || VERIFICATION_MESSAGES[VERIFICATION_OUTCOMES.UNKNOWN];
}

// The confirmation token is only ever sent to the backend and never logged.
export function buildVerificationConfirmBody(token) {
  return { token: typeof token === "string" ? token : "" };
}

// School accounts require a workspace slug; platform accounts omit it. Blank
// values are dropped so the strict backend schema accepts the payload.
export function buildResendVerificationPayload(form = {}) {
  const email = (form.email ?? "").trim();
  const schoolSlug = (form.schoolSlug ?? "").trim();
  return {
    endpoint: "/auth/email-verification",
    body: {
      email,
      ...(schoolSlug ? { schoolSlug } : {})
    }
  };
}

// The backend answers 403 with this message when a genuinely marked account has
// not verified yet. It is distinct from an expired session (401) and must never
// be treated as one.
export const VERIFICATION_REQUIRED_MESSAGE = "Email address verification is required";

export function isVerificationRequiredError(reason) {
  return Boolean(reason)
    && reason.status === 403
    && typeof reason.message === "string"
    && reason.message.toLowerCase().includes("verification");
}

// Client-side guard mirroring the backend password policy (min 12 chars).
export function validateNewPassword(password, confirmation) {
  if (typeof password !== "string" || password.length < 12) {
    return "Password must be at least 12 characters.";
  }
  if (password !== confirmation) {
    return "The passwords do not match.";
  }
  return null;
}
