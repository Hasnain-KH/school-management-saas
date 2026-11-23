// Centralized ISO 4217 currency registry for SchoolFlow.
// One school = one base currency. This registry is for tenant-owned finance configuration,
// display, validation, and currency-aware minor-unit arithmetic. No FX conversion.

const DEFINITIONS = [
  ["AED", "United Arab Emirates Dirham", "د.إ", 2, "AE"],
  ["AUD", "Australian Dollar", "A$", 2, "AU"],
  ["BDT", "Bangladeshi Taka", "৳", 2, "BD"],
  ["BHD", "Bahraini Dinar", "BD", 3, "BH"],
  ["CAD", "Canadian Dollar", "C$", 2, "CA"],
  ["CHF", "Swiss Franc", "CHF", 2, "CH"],
  ["CNY", "Chinese Yuan", "¥", 2, "CN"],
  ["EGP", "Egyptian Pound", "E£", 2, "EG"],
  ["EUR", "Euro", "€", 2, "EU"],
  ["GBP", "British Pound", "£", 2, "GB"],
  ["GHS", "Ghanaian Cedi", "GH₵", 2, "GH"],
  ["INR", "Indian Rupee", "₹", 2, "IN"],
  ["JOD", "Jordanian Dinar", "JD", 3, "JO"],
  ["JPY", "Japanese Yen", "¥", 0, "JP"],
  ["KES", "Kenyan Shilling", "KSh", 2, "KE"],
  ["KRW", "South Korean Won", "₩", 0, "KR"],
  ["KWD", "Kuwaiti Dinar", "KD", 3, "KW"],
  ["LKR", "Sri Lankan Rupee", "Rs", 2, "LK"],
  ["MAD", "Moroccan Dirham", "MAD", 2, "MA"],
  ["MYR", "Malaysian Ringgit", "RM", 2, "MY"],
  ["NGN", "Nigerian Naira", "₦", 2, "NG"],
  ["NPR", "Nepalese Rupee", "Rs", 2, "NP"],
  ["NZD", "New Zealand Dollar", "NZ$", 2, "NZ"],
  ["OMR", "Omani Rial", "OMR", 3, "OM"],
  ["PKR", "Pakistani Rupee", "Rs", 2, "PK"],
  ["QAR", "Qatari Riyal", "QR", 2, "QA"],
  ["SAR", "Saudi Riyal", "SR", 2, "SA"],
  ["SGD", "Singapore Dollar", "S$", 2, "SG"],
  ["THB", "Thai Baht", "฿", 2, "TH"],
  ["TRY", "Turkish Lira", "₺", 2, "TR"],
  ["UGX", "Ugandan Shilling", "USh", 0, "UG"],
  ["USD", "US Dollar", "$", 2, "US"],
  ["XAF", "Central African CFA Franc", "FCFA", 0, "CM"],
  ["XOF", "West African CFA Franc", "CFA", 0, "SN"],
  ["ZAR", "South African Rand", "R", 2, "ZA"]
];

export const SUPPORTED_CURRENCIES = Object.freeze(
  DEFINITIONS.map(([code, name, symbol, fractionDigits, country]) =>
    Object.freeze({ code, name, symbol, fractionDigits, country }))
);

const BY_CODE = new Map(SUPPORTED_CURRENCIES.map((c) => [c.code, c]));

export const isSupportedCurrencyCode = (code) =>
  typeof code === "string" && BY_CODE.has(code.toUpperCase());

export const validateCurrencyCode = (code) => {
  const normalized = String(code || "").trim().toUpperCase();
  if (!BY_CODE.has(normalized)) {
    const error = new Error("Unsupported currency code");
    error.code = "UNSUPPORTED_CURRENCY";
    error.statusCode = 400;
    throw error;
  }
  return normalized;
};

export const getCurrencyConfig = (code) => {
  const normalized = String(code || "").trim().toUpperCase();
  return BY_CODE.get(normalized) || null;
};

export const getCurrencyFractionDigits = (code) => getCurrencyConfig(code)?.fractionDigits ?? 2;

export const getCurrencyMinorUnitFactor = (code) => 10 ** getCurrencyFractionDigits(code);

export const normalizeCurrencyCode = (code) => String(code || "").trim().toUpperCase();

export const listSupportedCurrencies = () => SUPPORTED_CURRENCIES.map((c) => ({ ...c }));

// Currency-aware minor-unit helpers. Amounts stored/transmitted in "minor units"
// are integers relative to the currency's fraction digits (e.g. USD cents, JPY whole yen, KWD fils).
// Legacy records before currency hardening were commonly stored as hundredths (exponent 2).
const moneyError = (message) => Object.assign(new Error(message), { statusCode: 400 });

const decimalStringFromNumber = (value) => {
  // 15 significant digits removes binary float noise (0.1 + 0.2 becomes "0.3")
  // without dropping user-supplied decimals (8.575 remains "8.575").
  return String(Number(value.toPrecision(15)));
};

const minorFromDecimal = (raw, currencyCode, digits, { allowRounding }) => {
  if (!raw || !/^-?\d+(\.\d+)?$/.test(raw)) throw moneyError("Invalid amount");
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [wholePart, fracPart = ""] = unsigned.split(".");
  if (fracPart.length > digits) {
    if (!allowRounding) {
      throw moneyError(`Invalid money amount: ${digits} decimal place(s) allowed for ${normalizeCurrencyCode(currencyCode) || "currency"}`);
    }
    // Round half away from zero on the decimal string, not on a binary float.
    const kept = fracPart.slice(0, digits);
    let minor = BigInt(wholePart) * (10n ** BigInt(digits)) + BigInt(kept || "0");
    if (Number(fracPart[digits]) >= 5) minor += 1n;
    const rounded = negative ? -minor : minor;
    if (rounded > BigInt(Number.MAX_SAFE_INTEGER) || rounded < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw moneyError("Invalid amount");
    }
    return Number(rounded);
  }
  const padded = (fracPart + "0".repeat(digits)).slice(0, digits);
  const minor = Number(wholePart) * (10 ** digits) + Number(padded || "0");
  const result = negative ? -minor : minor;
  if (!Number.isSafeInteger(result)) throw moneyError("Invalid amount");
  return result;
};

export const toMinorUnits = (amount, currencyCode, exponentOverride) => {
  const digits = Number.isInteger(exponentOverride) ? exponentOverride : getCurrencyFractionDigits(currencyCode);
  if (typeof amount === "number") {
    if (!Number.isFinite(amount)) throw moneyError("Invalid amount");
    return minorFromDecimal(decimalStringFromNumber(amount), currencyCode, digits, { allowRounding: true });
  }
  return minorFromDecimal(String(amount ?? "").trim().replace(/,/g, ""), currencyCode, digits, { allowRounding: false });
};

export const fromMinorUnits = (minorUnits, currencyCode, exponentOverride) => {
  const digits = Number.isInteger(exponentOverride) ? exponentOverride : getCurrencyFractionDigits(currencyCode);
  const factor = 10 ** digits;
  const n = Number(minorUnits || 0);
  if (!Number.isFinite(n)) return 0;
  return n / factor;
};

export const formatMoney = (amountMinor, currencyCode, locale = undefined, exponentOverride) => {
  const code = normalizeCurrencyCode(currencyCode);
  const config = getCurrencyConfig(code);
  const digits = Number.isInteger(exponentOverride) ? exponentOverride : (config?.fractionDigits ?? 2);
  const value = fromMinorUnits(amountMinor, code || "USD", digits);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: config ? code : "USD",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(value);
  } catch {
    const fixed = value.toFixed(digits);
    return config ? `${config.symbol}${fixed} ${code}` : `${fixed} ${code || "USD"}`;
  }
};

export const parseMoneyInput = (value, currencyCode, exponentOverride) => {
  if (value === null || value === undefined || value === "") return null;
  const digits = Number.isInteger(exponentOverride) ? exponentOverride : getCurrencyFractionDigits(currencyCode);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw moneyError("Invalid money amount");
    const raw = decimalStringFromNumber(value);
    const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
    if (decimals > digits) {
      throw moneyError(`Invalid money amount: ${digits} decimal place(s) allowed for ${normalizeCurrencyCode(currencyCode) || "currency"}`);
    }
    return minorFromDecimal(raw, currencyCode, digits, { allowRounding: false });
  }
  return minorFromDecimal(String(value).trim().replace(/[\s,]/g, ""), currencyCode, digits, { allowRounding: false });
};

export const safelyRoundMoney = (amountMinor) => {
  const n = Number(amountMinor);
  if (!Number.isFinite(n)) throw Object.assign(new Error("Invalid money amount"), { statusCode: 400 });
  return Math.round(n);
};

export const calculateMoneyTotals = (values = []) =>
  values.reduce((sum, value) => sum + safelyRoundMoney(Number(value || 0)), 0);

export const formatMoneyMajor = (amountMajor, currencyCode, locale = undefined) => {
  const code = normalizeCurrencyCode(currencyCode);
  const config = getCurrencyConfig(code);
  const digits = config?.fractionDigits ?? 2;
  const n = Number(amountMajor || 0);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: config ? code : "USD",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(n);
  } catch {
    return `${n.toFixed(digits)} ${code || "USD"}`;
  }
};

export const suggestCurrencyForCountry = (country) => {
  const c = String(country || "").trim().toLowerCase();
  if (!c) return null;
  const map = {
    pakistan: "PKR", "united states": "USD", usa: "USD", us: "USD",
    "united kingdom": "GBP", uk: "GBP", england: "GBP",
    "united arab emirates": "AED", uae: "AED", "saudi arabia": "SAR",
    india: "INR", bangladesh: "BDT", canada: "CAD", australia: "AUD",
    germany: "EUR", france: "EUR", spain: "EUR", italy: "EUR", netherlands: "EUR", ireland: "EUR",
    japan: "JPY", qatar: "QAR", kuwait: "KWD", oman: "OMR", bahrain: "BHD",
    nigeria: "NGN", kenya: "KES", "south africa": "ZAR", ghana: "GHS",
    turkey: "TRY", "sri lanka": "LKR", nepal: "NPR", singapore: "SGD",
    malaysia: "MYR", china: "CNY", switzerland: "CHF", "new zealand": "NZD"
  };
  return map[c] || null;
};
