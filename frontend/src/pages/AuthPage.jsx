import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, BookOpenCheck, Check, Mail, School } from "../components/ui/icon/icons.jsx";
import { useAuth } from "../auth/AuthProvider.jsx";
import { ApiError, post } from "../api/client.js";
import {
  buildResendVerificationPayload,
  isVerificationRequiredError,
  validateNewPassword
} from "../utils/email-verification.js";

export default function AuthPage({ mode }) {
  const isRegister = mode === "register";
  const isRecovery = mode === "recovery";
  const isReset = mode === "reset";
  const isResend = mode === "resend";
  const [searchParams] = useSearchParams();
  const { signIn, register } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [feedbackType, setFeedbackType] = useState("error");
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setFeedbackType("error");
    setVerificationRequired(false);
    setBusy(true);
    const values = Object.fromEntries(
      [...new FormData(event.currentTarget)].filter(([, value]) => value !== "")
    );
    try {
      if (isResend) {
        const { endpoint, body } = buildResendVerificationPayload(values);
        await post(endpoint, body);
        setError("If the account is eligible, a new verification email is on its way. Any earlier verification link has now been invalidated.");
        setFeedbackType("success");
        return;
      } else if (isRecovery) {
        await post("/auth/password-recovery", values);
        setError("If the account exists and delivery is configured, password recovery instructions will be sent.");
        setFeedbackType("success");
        return;
      } else if (isReset) {
        const passwordError = validateNewPassword(values.password, values.confirmPassword);
        if (passwordError) {
          setError(passwordError);
          return;
        }
        await post("/auth/password-reset", { token: values.token, password: values.password });
        navigate("/login", { replace: true });
        return;
      } else if (isRegister) {
        const result = await register(values);
        if (!result.authenticated) {
          setError(result.emailVerificationRequired
            ? "Your school is registered. Check your email and verify the address before signing in."
            : result.message || "Your school is registered. Sign in after email verification is available.");
          setFeedbackType("success");
          return;
        }
      } else {
        await signIn(values);
      }
      navigate("/", { replace: true });
    } catch (reason) {
      if (isVerificationRequiredError(reason)) {
        setVerificationRequired(true);
        setError("Your email address must be verified before you can sign in.");
        return;
      }
      if (isReset && reason instanceof ApiError && reason.status === 400) {
        // The API returns 400 for both token rejection and request validation.
        // Keep the reset-link message for token errors only so a password-policy
        // failure is not misreported as a bad link.
        const passwordIssue = reason.errors?.find(({ path }) =>
          (Array.isArray(path) ? path : [path]).includes("password")
        );
        setError(passwordIssue
          ? "Choose a password that meets the requirements and try again."
          : "This reset link is invalid, expired, or has already been used. Request a new password reset email.");
        return;
      }
      setError(reason instanceof ApiError ? reason.message : "The service could not be reached. Check the API connection and try again.");
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
        </> : <>
          <label>School workspace<input name="schoolSlug" autoComplete="organization" placeholder="your-school" /></label>
          <label>Email address<input name="email" type="email" required autoComplete="username" placeholder="you@school.edu" /></label>
        </>}
        {!isRecovery && !isResend && <label>{isReset ? "New password" : "Password"}<input name="password" type="password" required minLength={isRegister || isReset ? 12 : 1} maxLength="72" autoComplete={isRegister || isReset ? "new-password" : "current-password"} placeholder={isRegister || isReset ? "At least 12 characters" : "Enter your password"} /></label>}
        {isReset && <label>Confirm new password<input name="confirmPassword" type="password" required minLength="12" maxLength="72" autoComplete="new-password" placeholder="Re-enter your new password" /></label>}
        {error && <div className={feedbackType === "success" ? "auth-message" : "form-error"} role={feedbackType === "success" ? "status" : "alert"}>{error}</div>}
        {verificationRequired && <div className="auth-message" role="status"><Mail size={15} /> Need a new link? <Link to="/resend-verification">Resend the verification email</Link>.</div>}
        {!isRegister && !isRecovery && !isReset && !isResend && <div className="forgot-link"><Link to="/forgot-password">Forgot password?</Link></div>}
        <button className="button button-primary button-wide" disabled={busy}>{busy ? "Please wait…" : isRegister ? "Create school workspace" : isRecovery ? "Send recovery instructions" : isReset ? "Reset password" : isResend ? "Send verification email" : "Sign in"}<ArrowRight size={17} /></button>
        <p className="secure-note"><Check size={14} /> Your account is protected by secure, school-scoped access.</p>
      </form>
      <div className="auth-switch">{isRegister ? "Already have a workspace?" : isRecovery || isReset || isResend ? "Remembered your password?" : "New to SchoolFlow?"} <Link to={isRegister || isRecovery || isReset || isResend ? "/login" : "/register"}>{isRegister || isRecovery || isReset || isResend ? "Sign in" : "Register your school"}</Link></div>
    </div><div className="auth-legal">By continuing, you agree to use SchoolFlow in accordance with your school’s policies.</div></section>
  </div>;
}
