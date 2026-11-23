import { HttpError } from "../utils/http-error.js";
import {
    emailVerificationTemplate,
    notificationTemplate,
    overdueFeeReminderTemplate,
    passwordResetTemplate,
    welcomeTemplate
} from "./email-templates.js";

let provider = null;

export const configureEmailDeliveryProvider = (emailProvider) => {
    if (!emailProvider
        || typeof emailProvider.sendPasswordReset !== "function"
        || typeof emailProvider.sendEmailVerification !== "function") {
        throw new TypeError("Email provider must implement password reset and email verification delivery");
    }
    provider = emailProvider;
};

export const getEmailDeliveryProvider = () => {
    if (!provider) {
        throw new HttpError(503, "Email delivery is unavailable until an email provider is configured");
    }
    return provider;
};

export const getFeeReminderProvider = () => {
    const configured = getEmailDeliveryProvider();
    if (typeof configured.sendOverdueFeeReminder !== "function") {
        throw new HttpError(503, "Overdue fee reminder delivery is unavailable until an email provider implements it");
    }
    return configured;
};

export const isEmailDeliveryConfigured = () => provider !== null;

// Generic JSON-over-HTTP email transport. The default target is Resend
// (https://resend.com/docs/api-reference/emails/send-email), which any of the
// supported providers can be adapted to by overriding EMAIL_API_URL and headers.
export const createHttpEmailProvider = ({
    apiUrl,
    apiKey,
    from,
    replyTo,
    fetchImpl = fetch,
    timeoutMs = 10000
} = {}) => {
    if (!apiUrl || !apiKey || !from) {
        throw new TypeError("Email provider requires apiUrl, apiKey, and from");
    }

    const send = async ({ to, template, idempotencyKey }) => {
        if (!to) throw new HttpError(400, "Email recipient is required");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
                },
                body: JSON.stringify({
                    from,
                    to: [to],
                    subject: template.subject,
                    html: template.html,
                    text: template.text,
                    ...(replyTo ? { reply_to: replyTo } : {})
                }),
                signal: controller.signal
            });
            if (!response.ok) {
                const error = new HttpError(502, "The email provider rejected the message");
                error.code = `EMAIL_${response.status}`;
                throw error;
            }
            return { delivered: true };
        } finally {
            clearTimeout(timeout);
        }
    };

    return {
        async sendPasswordReset({ email, token }) {
            return send({ to: email, template: passwordResetTemplate({ token }) });
        },
        async sendEmailVerification({ email, token }) {
            return send({ to: email, template: emailVerificationTemplate({ token }) });
        },
        async sendOverdueFeeReminder({ to, guardianName, period, dueDate, balanceMinor, currency, currencyExponent, idempotencyKey }) {
            return send({
                to,
                idempotencyKey,
                template: overdueFeeReminderTemplate({ guardianName, period, dueDate, balanceMinor, currency, currencyExponent })
            });
        },
        async sendWelcome({ email, name, schoolName }) {
            return send({ to: email, template: welcomeTemplate({ name, schoolName }) });
        },
        async sendNotification({ email, name, title, body, idempotencyKey }) {
            return send({ to: email, idempotencyKey, template: notificationTemplate({ name, title, body }) });
        }
    };
};

// Configures email delivery from environment variables. No-op (leaving the 503
// behaviour in place) when the required secrets are absent, so local and test
// environments are never forced to have an email account.
export const configureEmailDeliveryFromEnv = () => {
    const apiKey = process.env.EMAIL_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) return null;
    const apiUrl = process.env.EMAIL_API_URL ?? "https://api.resend.com/emails";
    const providerInstance = createHttpEmailProvider({
        apiUrl,
        apiKey,
        from,
        replyTo: process.env.EMAIL_REPLY_TO
    });
    configureEmailDeliveryProvider(providerInstance);
    return providerInstance;
};
