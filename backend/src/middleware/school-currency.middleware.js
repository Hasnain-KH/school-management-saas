import { getCurrencyConfig } from "../utils/currency.js";
import { HttpError } from "../utils/http-error.js";

export const requireConfiguredSchoolCurrency = (options = {}) => (req, _res, next) => {
  const mutationsOnly = options.mutationsOnly === true;
  const school = req.school;
  if (!school) return next(new HttpError(403, "Tenant context required"));

  const code = school.baseCurrency;
  const configured = school.currencyConfigurationStatus === "configured" && Boolean(getCurrencyConfig(code));
  if (configured) {
    req.schoolCurrency = getCurrencyConfig(code);
    return next();
  }

  if (mutationsOnly && ["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  return next(new HttpError(409, "School base currency is not configured. An authorized school administrator must confirm the base currency in Financial Settings before financial operations can proceed."));
};

export const resolveSchoolCurrency = (req) => {
  const code = req.school?.baseCurrency;
  const currency = getCurrencyConfig(code);
  if (req.school?.currencyConfigurationStatus !== "configured" || !currency) return null;
  return currency;
};
