import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, BookOpenCheck, Check, Mail, School } from "../components/ui/icon/icons.jsx";
import { useAuth } from "../auth/AuthProvider.jsx";
import { ApiError, get, post } from "../api/client.js";
import {
  buildResendVerificationPayload,
  isVerificationRequiredError,
  validateNewPassword
} from "../utils/email-verification.js";
import { notify } from "../components/feedback/appFeedback.js";
import { SUPPORTED_CURRENCIES } from "../utils/currency.js";

export default function AuthPage({ mode }) {
  const isRegister = mode === "register";
  const isRecovery = mode === "recovery";
  const isReset = mode === "reset";
  const isResend = mode === "resend";
  const [searchParams] = useSearchParams();
  const { signIn, register } = useAuth();
  const navigate = useNavigate();
  const [validationError, setValidationError] = useState("");
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [currencies, setCurrencies] = useState(SUPPORTED_CURRENCIES);
  const [currencySearch, setCurrencySearch] = useState("");
  const [baseCurrency, setBaseCurrency] = useState("");
  const [currencyConfirmed, setCurrencyConfirmed] = useState(false);

  useEffect(() => {
    if (!isRegister) return;
    let active = true;
    get("/schools/currencies")
      .then((data) => { if (active && Array.isArray(data?.currencies) && data.currencies.length) setCurrencies(data.currencies); })
      .catch(() => { /* fallback to local list */ });
    return () => { active = false; };
  }, [isRegister]);

  const filteredCurrencies = useMemo(() => {
    const q = currencySearch.trim().toLowerCase();
    if (!q) return currencies;
    return currencies.filter((c) =>
      [c.code, c.name, c.symbol, c.country].some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [currencies, currencySearch]);

  const selectedCurrency = useMemo(
    () => currencies.find((c) => c.code === baseCurrency) || null,
    [currencies, baseCurrency]
  );

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setValidationError("");
    setVerificationRequired(false);
    setBusy(true);
    const values = Object.fromEntries(
      [...new FormData(event.currentTarget)].filter(([, value]) => value !== "")
    );
    try {
      if (isRegister) {
        if (!baseCurrency) {
          setValidationError("Select your school's base currency. This is required before financial workflows can be enabled.");
          return;
        }
        if (!currencyConfirmed) {
          setValidationError("Please confirm the selected base currency. This currency will be used for school-owned financial operations.");
          return;
        }
        values.baseCurrency = baseCurrency;
        values.currencyConfirmed = true;
      }
      if (isResend) {
        const { endpoint, body } = buildResendVerificationPayload(values);
        await post(endpoint, body);
        notify.success("Verification email sent", { description: "If the account is eligible, a new verification email is on its way. Any earlier verification link has now been invalidated." });
        return;
      } else if (isRecovery) {
        await post("/auth/password-recovery", values);
        notify.success("Check your email", { description: "If the account exists and delivery is configured, password recovery instructions will be sent." });
        return;
      } else if (isReset) {
        const passwordError = validateNewPassword(values.password, values.confirmPassword);
        if (passwordError) {
          setValidationError(passwordError);
          return;
        }
        await post("/auth/password-reset", { token: values.token, password: values.password });
        notify.success("Password reset complete", { description: "You can now sign in with your new password." });
        navigate("/login", { replace: true });
        return;
      } else if (isRegister) {
        const result = await register(values);
        if (!result.authenticated) {
          notify.success("Your school is registered", {
            description: result.emailVerificationRequired
              ? "Check your email and verify the address before signing in."
              : "Sign in after email verification is available."
          });
          return;
        }
        notify.success("School workspace created");
      } else {
        await signIn(values);
        notify.success("Signed in successfully");
      }
      navigate("/", { replace: true });
    } catch (reason) {
      if (isVerificationRequiredError(reason)) {
        // The inline status link below is the single verification surface;
        // a toast here would create a second role=status for the same outcome.
        setVerificationRequired(true);
        return;
      }
      if (isReset && reason instanceof ApiError && reason.status === 400) {
        // The API returns 400 for both token rejection and request validation.
        // Keep the reset-link message for token errors only so a password-policy
        // failure is not misreported as a bad link.
        const passwordIssue = reason.errors?.find(({ path }) =>
          (Array.isArray(path) ? path : [path]).includes("password")
        );
        notify.error(reason, passwordIssue
          ? { title: "Choose a password that meets the requirements" }
          : { title: "This reset link is invalid, expired, or has already been used", description: "Request a new password reset email and try again." });
        return;
      }
      if (!isReset && reason instanceof ApiError && reason.status === 401) {
        notify.error(reason, { title: "Invalid credentials" });
        return;
      }
      if (isRegister && reason instanceof ApiError && reason.status >= 500) {
        notify.error(reason, {
          title: "School registration could not be completed",
          description: "School registration is temporarily unavailable. Please try again later."
        });
        return;
      }
      notify.error(reason);
    } finally {
      setBusy(false);
    }
  };

  return <div className="auth-layout">
    <section className="auth-story">
      <Link to="/login" className="brand auth-brand"><span className="brand-mark"><School size={19} /></span><span>school<span className="brand-light">flow</span></span></Link>
      <div className="story-content"><div className="eyebrow"><span className="eyebrow-line" /> A calmer way to run your school</div><h1>More time for what<br /><span>matters most.</span></h1><p>Bring your people, academics, and school operations together in one thoughtfully connected workspace.</p><div className="story-proof"><span className="proof-icon"><BookOpenCheck size={18} /></span><div><strong>Built around your school day</strong><small>One secure workspace, from the first bell to the last report.</small></div></div></div>
      <div className="story-foot"><span>Designed for better school days.</span><span>SchoolFlow © {new Date().getFullYear()}</span></div>
    </section>
    <section className="auth-main"><div className="auth-mobile-brand"><School size={19} /> schoolflow</div><div className="auth-card">
      <div className="auth-heading"><div className="auth-icon"><School size={20} /></div><h2>{isRegister ? "Start your school workspace" : isRecovery ? "Recover your password" : isReset ? "Choose a new password" : isResend ? "Resend verification email" : "Welcome back"}</h2><p>{isRegister ? "Create your school account and get your team moving." : isRecovery ? "Enter the email address associated with your school account." : isReset ? "Use the secure reset token from your email." : isResend ? "Enter the email address associated with your account to receive a new verification link." : "Sign in to continue to your school workspace."}</p></div>
      <form className="form-stack" onSubmit={submit}>
        {isRecovery || isResend ? <>
          <label>School workspace <span className="optional">(optional for platform accounts)</span><input name="schoolSlug" autoComplete="organization" placeholder="your-school" /></label>
          <label>Email address<input name="email" type="email" required autoComplete="email" placeholder="you@school.edu" /></label>
        </> : isReset ? <>
          <label>Reset token<input name="token" required defaultValue={searchParams.get("token") || ""} autoComplete="one-time-code" /></label>
        </> : isRegister ? <>
          <label>School name<input name="schoolName" required minLength="2" maxLength="120" autoComplete="organization" placeholder="e.g. Northstar Academy" /></label>
          <div className="form-grid"><label>Administrator name<input name="adminName" required minLength="2" maxLength="120" autoComplete="name" placeholder="Your name" /></label><label>Phone <span className="optional">(optional)</span><input name="phone" minLength="3" maxLength="30" autoComplete="tel" placeholder="+1 555 0100" /></label></div>
          <label>Work email<input type="email" name="email" required autoComplete="email" placeholder="you@school.edu" /></label>
          <div className="currency-setup-block">
            <label>Base currency <span className="required">*</span>
              <input
                type="search"
                value={currencySearch}
                onChange={(e) => setCurrencySearch(e.target.value)}
                placeholder="Search by name, code, symbol, or country"
                autoComplete="off"
              />
            </label>
            <label className="sr-only" htmlFor="baseCurrencySelect">Select base currency</label>
            <select
              id="baseCurrencySelect"
              value={baseCurrency}
              onChange={(e) => { setBaseCurrency(e.target.value); setCurrencyConfirmed(false); }}
              required
              size={Math.min(6, Math.max(4, filteredCurrencies.length || 1))}
              aria-describedby="currency-setup-help"
            >
              <option value="">Select a currency…</option>
              {filteredCurrencies.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol})</option>
              ))}
            </select>
            <p id="currency-setup-help" className="field-help">One school = one base currency. This is used for school-owned fees, payroll, expenses, assets, receipts, and reports. Platform SaaS billing stays separate.</p>
            {selectedCurrency && (
              <div className="currency-preview" role="status">
                <strong>Selected: {selectedCurrency.name}</strong>
                <span>{selectedCurrency.code} · {selectedCurrency.symbol} · {selectedCurrency.fractionDigits} decimal place{selectedCurrency.fractionDigits === 1 ? "" : "s"}</span>
              </div>
            )}
            <label className="currency-confirm-check">
              <input
                type="checkbox"
                checked={currencyConfirmed}
                onChange={(e) => setCurrencyConfirmed(e.target.checked)}
                disabled={!baseCurrency}
              />
              <span>I confirm <strong>{selectedCurrency ? `${selectedCurrency.code} (${selectedCurrency.name})` : "the selected currency"}</strong> is this school's base currency. It can be changed before financial transactions exist; after that, changes are locked to protect historical records.</span>
            </label>
          </div>
        </> : <>
          <label>School workspace<input name="schoolSlug" autoComplete="organization" placeholder="your-school" /></label>
          <label>Email address<input name="email" type="email" required autoComplete="username" placeholder="you@school.edu" /></label>
        </>}
        {!isRecovery && !isResend && <label>{isReset ? "New password" : "Password"}<input name="password" type="password" required minLength={isRegister || isReset ? 12 : 1} maxLength="72" autoComplete={isRegister || isReset ? "new-password" : "current-password"} placeholder={isRegister || isReset ? "At least 12 characters" : "Enter your password"} /></label>}
        {isReset && <label>Confirm new password<input name="confirmPassword" type="password" required minLength="12" maxLength="72" autoComplete="new-password" placeholder="Re-enter your new password" /></label>}
        {validationError && <div className="form-error" role="alert">{validationError}</div>}
        {verificationRequired && <div className="auth-message" role="status"><Mail size={15} /> Need a new link? <Link to="/resend-verification">Resend the verification email</Link>.</div>}
        {!isRegister && !isRecovery && !isReset && !isResend && <div className="forgot-link"><Link to="/forgot-password">Forgot password?</Link></div>}
        <button className="button button-primary button-wide" disabled={busy}>{busy ? "Please wait…" : isRegister ? "Create school workspace" : isRecovery ? "Send recovery instructions" : isReset ? "Reset password" : isResend ? "Send verification email" : "Sign in"}<ArrowRight size={17} /></button>
        <p className="secure-note"><Check size={14} /> Your account is protected by secure, school-scoped access.</p>
      </form>
      <div className="auth-switch">{isRegister ? "Already have a workspace?" : isRecovery || isReset || isResend ? "Remembered your password?" : "New to SchoolFlow?"} <Link to={isRegister || isRecovery || isReset || isResend ? "/login" : "/register"}>{isRegister || isRecovery || isReset || isResend ? "Sign in" : "Register your school"}</Link></div>
    </div><div className="auth-legal">By continuing, you agree to use SchoolFlow in accordance with your school’s policies.</div></section>
  </div>;
}
