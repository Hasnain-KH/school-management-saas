import { login, logout, refreshTokens, registerSchool } from "../services/auth.service.js";
import {
    completeAccountAction,
    requestEmailVerification,
    requestPasswordRecovery
} from "../services/account-security.service.js";
import { sendSuccess } from "../utils/responses.js";

export const register = async (req, res) => {
    const result = await registerSchool(req.body);
    return sendSuccess(res, 201, result, "School registration completed");
};

export const signIn = async (req, res) => {
    const result = await login(req.body);
    return sendSuccess(res, 200, result, "Signed in");
};

export const refresh = async (req, res) => {
    const result = await refreshTokens(req.body.refreshToken);
    return sendSuccess(res, 200, result, "Tokens refreshed");
};

export const signOut = async (req, res) => {
    await logout(req.user, req.authSession.accessTokenId, req.body.refreshToken);
    return sendSuccess(res, 200, null, "Signed out");
};

export const currentUser = async (req, res) => {
    const user = {
        id: req.user._id.toString(),
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        schoolId: req.user.schoolId?.toString() ?? null
    };
    const school = req.school
        ? {
            id: req.school._id.toString(),
            name: req.school.name,
            slug: req.school.slug,
            status: req.school.status,
            subscription: req.school.subscription
        }
        : null;

    return sendSuccess(res, 200, { user, school });
};

export const requestPasswordReset = async (req, res) => {
    const result = await requestPasswordRecovery(req.body);
    return sendSuccess(res, 202, result, result.message);
};

export const requestVerification = async (req, res) => {
    const result = await requestEmailVerification(req.body);
    return sendSuccess(res, 202, result, result.message);
};

export const resetPassword = async (req, res) => {
    await completeAccountAction("password_reset", req.body.token, req.body.password);
    return sendSuccess(res, 200, null, "Password has been reset; sign in again");
};

export const verifyEmail = async (req, res) => {
    await completeAccountAction("email_verification", req.body.token);
    return sendSuccess(res, 200, null, "Email address verified");
};
