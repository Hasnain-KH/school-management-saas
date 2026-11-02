import { HttpError } from "../utils/http-error.js";

let provider = null;

export const configurePaymentGatewayProvider = (gateway) => {
    if (!gateway
        || typeof gateway.createCheckoutSession !== "function"
        || typeof gateway.verifyWebhook !== "function") {
        throw new TypeError("Payment gateway must implement checkout creation and webhook verification");
    }
    provider = gateway;
};

export const getPaymentGatewayProvider = () => {
    if (!provider) {
        throw new HttpError(503, "Online payments are unavailable until a payment gateway is configured");
    }
    return provider;
};

export const isPaymentGatewayConfigured = () => provider !== null;
