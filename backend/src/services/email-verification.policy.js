import { isEmailVerificationRequired } from "../config/env.js";
import { isEmailDeliveryConfigured } from "./email-delivery.provider.js";

// An account is blocked until it verifies only when it was explicitly created
// under the mandatory-verification policy (emailVerificationRequired === true)
// and still has no verification timestamp. Legacy records without the marker are
// treated as not required, so configuring an email provider never locks out
// existing school admins, principals, teachers, or parents. Platform super
// admins are always exempt so a deployment can never lock itself out.
export const requiresEmailVerification = (user) =>
    Boolean(user)
    && user.role !== "platform_super_admin"
    && user.emailVerificationRequired === true
    && !user.emailVerifiedAt;

// New accounts are marked (and emailed) only when the operator opted in AND a
// provider is actually configured to deliver the verification link. The startup
// configuration guard in config/env.js refuses to run the policy without a
// provider, so this combination is safe by construction.
export const shouldMarkNewAccountsForVerification = () =>
    isEmailVerificationRequired() && isEmailDeliveryConfigured();
