import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowRight, CheckCircle2, LoaderCircle, Mail, School } from "../components/ui/icon/icons.jsx";
import { post } from "../api/client.js";
import {
  VERIFICATION_OUTCOMES,
  buildVerificationConfirmBody,
  verificationMessage,
  verificationOutcome
} from "../utils/email-verification.js";

const isErrorOutcome = (outcome) => ![
  VERIFICATION_OUTCOMES.SUCCESS,
  VERIFICATION_OUTCOMES.ALREADY_VERIFIED
].includes(outcome);

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  // The confirmation token is read once and never logged, stored, or echoed.
  const started = useRef(false);
  const [outcome, setOutcome] = useState(null);

  useEffect(() => {
    // React StrictMode runs effects twice in development; the ref keeps the
    // single-use token from being submitted more than once.
    if (started.current) return;
    started.current = true;

    if (!token) {
      setOutcome(VERIFICATION_OUTCOMES.MISSING);
      return;
    }

    // setState after an unmount is a no-op in React 18, so a late response is
    // harmless and the outcome does not need an unmount guard.
    post("/auth/email-verification/confirm", buildVerificationConfirmBody(token))
      .then(() => setOutcome(VERIFICATION_OUTCOMES.SUCCESS))
      .catch((reason) => setOutcome(verificationOutcome(reason?.status)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifying = outcome === null;
  const failed = !verifying && isErrorOutcome(outcome);
  const heading = verifying
    ? "Verifying your email"
    : failed
      ? "We couldn’t verify this link"
      : "Email verified";

  return <div className="auth-layout">
    <section className="auth-story">
      <Link to="/login" className="brand auth-brand"><span className="brand-mark"><School size={19} /></span><span>school<span className="brand-light">flow</span></span></Link>
      <div className="story-content"><div className="eyebrow"><span className="eyebrow-line" /> A calmer way to run your school</div><h1>One click to<br /><span>keep it secure.</span></h1><p>Verifying your email address confirms it belongs to you and keeps your school workspace protected.</p></div>
      <div className="story-foot"><span>Designed for better school days.</span><span>SchoolFlow © {new Date().getFullYear()}</span></div>
    </section>
    <section className="auth-main"><div className="auth-mobile-brand"><School size={19} /> schoolflow</div><div className="auth-card">
      <div className="auth-heading">
        <div className="auth-icon">{verifying ? <LoaderCircle className="spin" size={20} /> : failed ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}</div>
        <h2>{heading}</h2>
        <p>{verifying ? "This only takes a moment." : "You can continue from here."}</p>
      </div>
      <div className="form-stack">
        {verifying
          ? <div className="auth-message" role="status">Checking your verification link…</div>
          : <div className={failed ? "form-error" : "auth-message"} role={failed ? "alert" : "status"}>{verificationMessage(outcome)}</div>}
        <Link className="button button-primary button-wide" to="/login">{failed ? "Back to sign in" : "Sign in"}<ArrowRight size={17} /></Link>
        {failed && <Link className="button button-quiet button-wide" to="/resend-verification"><Mail size={16} /> Resend verification email</Link>}
        <p className="secure-note"><CheckCircle2 size={14} /> Verification links are single-use and expire after 30 minutes.</p>
      </div>
    </div><div className="auth-legal">If you did not request this verification, you can safely ignore it.</div></section>
  </div>;
}
