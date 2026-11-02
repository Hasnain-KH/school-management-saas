import { getConfig } from "../config/env.js";

const production = process.env.NODE_ENV === "production";

export const authCookieNames = {
    access: production ? "__Secure-schoolflow-access" : "schoolflow_access",
    refresh: production ? "__Secure-schoolflow-refresh" : "schoolflow_refresh",
    csrf: production ? "__Secure-schoolflow-csrf" : "schoolflow_csrf"
};

const cookieDefaults = {
    secure: production,
    sameSite: "lax"
};

export const setAuthCookies = (res, tokens) => {
    const config = getConfig();
    res.cookie(authCookieNames.access, tokens.accessToken, {
        ...cookieDefaults,
        httpOnly: true,
        path: "/api/v1",
        maxAge: config.accessTokenTtlSeconds * 1000
    });
    res.cookie(authCookieNames.refresh, tokens.refreshToken, {
        ...cookieDefaults,
        httpOnly: true,
        path: "/api/v1/auth",
        maxAge: config.refreshTokenTtlSeconds * 1000
    });
};

export const clearAuthCookies = (res) => {
    res.clearCookie(authCookieNames.access, {
        ...cookieDefaults,
        httpOnly: true,
        path: "/api/v1"
    });
    res.clearCookie(authCookieNames.refresh, {
        ...cookieDefaults,
        httpOnly: true,
        path: "/api/v1/auth"
    });
};
