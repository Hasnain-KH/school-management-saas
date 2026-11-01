import { HttpError } from "../utils/http-error.js";

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

export const isEmailDeliveryConfigured = () => provider !== null;
