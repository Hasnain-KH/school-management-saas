import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAllowedOrigins, getConfig } from "../config/env.js";
import { authCookieNames } from "../security/auth-cookies.js";
import { HttpError } from "../utils/http-error.js";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const authCookiePaths = new Set([
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/refresh",
    "/api/v1/auth/logout"
]);

const signNonce = (nonce) => createHmac("sha256", getConfig().accessSecret)
    .update(nonce)
    .digest("base64url");

export const createCsrfToken = () => {
    const nonce = randomBytes(32).toString("base64url");
    return `${nonce}.${signNonce(nonce)}`;
};

export const isValidCsrfToken = (token) => {
    if (typeof token !== "string" || token.length > 100) return false;
    const separator = token.indexOf(".");
    if (separator <= 0 || separator === token.length - 1) return false;
    const nonce = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    const expected = signNonce(nonce);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length
        && timingSafeEqual(actualBuffer, expectedBuffer);
};

const tokensMatch = (left, right) => {
    if (typeof left !== "string" || typeof right !== "string") return false;
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

export const issueCsrfToken = (req, res) => {
    const existing = req.cookies?.[authCookieNames.csrf];
    const token = isValidCsrfToken(existing) ? existing : createCsrfToken();
    res.cookie(authCookieNames.csrf, token, {
        secure: process.env.NODE_ENV === "production",
        httpOnly: false,
        sameSite: "lax",
        path: "/api/v1",
        maxAge: 12 * 60 * 60 * 1000
    });
    return res.status(200).json({
        success: true,
        message: "CSRF token issued",
        data: { csrfToken: token }
    });
};

export const csrfProtection = (req, res, next) => {
    if (safeMethods.has(req.method)) return next();

    const hasAuthCookie = Boolean(
        req.cookies?.[authCookieNames.access] || req.cookies?.[authCookieNames.refresh]
    );
    if (!hasAuthCookie && !authCookiePaths.has(req.path)) return next();

    const origin = req.get("origin");
    const cookieToken = req.cookies?.[authCookieNames.csrf];
    const headerToken = req.get("x-csrf-token");
    if (!origin || !getAllowedOrigins().includes(origin)) {
        return next(new HttpError(403, "Request origin is not allowed"));
    }
    if (!tokensMatch(cookieToken, headerToken) || !isValidCsrfToken(cookieToken)) {
        return next(new HttpError(403, "CSRF token is invalid or missing"));
    }
    return next();
};
