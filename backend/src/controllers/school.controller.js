import {
    configureSchoolCurrency,
    getSchoolCurrencySettings,
    getSchoolProfile,
    getSchoolSubscriptionSummary,
    listCurrencies,
    updateSchoolProfile
} from "../services/school.service.js";
import { toPublicSchool } from "../services/auth.service.js";
import { HttpError } from "../utils/http-error.js";
import { sendSuccess } from "../utils/responses.js";

export const getCurrentSchool = async (req, res) => {
    const school = await getSchoolProfile(req);
    if (!school) {
        throw new HttpError(404, "School was not found");
    }
    return sendSuccess(res, 200, { school: toPublicSchool(school) });
};

export const updateCurrentSchool = async (req, res) => {
    const school = await updateSchoolProfile(req, req.body);
    if (!school) {
        throw new HttpError(404, "School was not found");
    }
    return sendSuccess(res, 200, { school: toPublicSchool(school) }, "School profile updated");
};

export const getCurrentSubscription = async (req, res) => {
    const subscription = await getSchoolSubscriptionSummary(req);
    if (!subscription) throw new HttpError(404, "School was not found");
    return sendSuccess(res, 200, subscription);
};

export const getSupportedCurrencies = async (_req, res) => {
    return sendSuccess(res, 200, { currencies: listCurrencies() });
};

export const getCurrentCurrency = async (req, res) => {
    const currency = await getSchoolCurrencySettings(req);
    return sendSuccess(res, 200, currency);
};

export const configureCurrentCurrency = async (req, res) => {
    const school = await configureSchoolCurrency(req, req.body);
    const currency = await getSchoolCurrencySettings(req);
    return sendSuccess(res, 200, { school: toPublicSchool(school), ...currency }, "School base currency configured");
};
