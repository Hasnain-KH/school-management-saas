import { login, logout, refreshTokens, registerSchool } from "../services/auth.service.js";
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
