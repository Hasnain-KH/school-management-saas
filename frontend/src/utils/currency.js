// Centralized currency registry for SchoolFlow frontend.
// Keep in sync with backend/src/utils/currency.js supported codes.

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

export const SUPPORTED_CURRENCIES = DEFINITIONS.map(([code, name, symbol, fractionDigits, country]) => ({
  code, name, symbol, fractionDigits, country
}));

const BY_CODE = new Map(SUPPORTED_CURRENCIES.map((c) => [c.code, c]));

export const getCurrencyConfig = (code) => BY_CODE.get(String(code || "").trim().toUpperCase()) || null;
export const getCurrencyFractionDigits = (code) => getCurrencyConfig(code)?.fractionDigits ?? 2;
export const getCurrencyMinorUnitFactor = (code) => 10 ** getCurrencyFractionDigits(code);
export const normalizeCurrencyCode = (code) => String(code || "").trim().toUpperCase();
export const isSupportedCurrencyCode = (code) => BY_CODE.has(normalizeCurrencyCode(code));

export const fromMinorUnits = (minorUnits, currencyCode, exponentOverride) => {
  const digits = Number.isInteger(exponentOverride) ? exponentOverride : getCurrencyFractionDigits(currencyCode);
  const factor = 10 ** digits;
  return Number(minorUnits || 0) / factor;
};

const decimalStringFromNumber = (value) => String(Number(value.toPrecision(15)));

const minorFromDecimal = (raw, digits, allowRounding) => {
  if (!raw || !/^-?\d+(\.\d+)?$/.test(raw)) return NaN;
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [wholePart, fracPart = ""] = unsigned.split(".");
  if (fracPart.length > digits) {
    if (!allowRounding) return NaN;
    const kept = fracPart.slice(0, digits);
    let minor = BigInt(wholePart) * (10n ** BigInt(digits)) + BigInt(kept || "0");
    if (Number(fracPart[digits]) >= 5) minor += 1n;
    const rounded = negative ? -minor : minor;
    if (rounded > BigInt(Number.MAX_SAFE_INTEGER) || rounded < BigInt(Number.MIN_SAFE_INTEGER)) return NaN;
    return Number(rounded);
  }
  const padded = (fracPart + "0".repeat(digits)).slice(0, digits);
  const minor = Number(wholePart) * (10 ** digits) + Number(padded || "0");
  const result = negative ? -minor : minor;
  return Number.isSafeInteger(result) ? result : NaN;
};

export const toMinorUnits = (amount, currencyCode, exponentOverride) => {
  const digits = Number.isInteger(exponentOverride) ? exponentOverride : getCurrencyFractionDigits(currencyCode);
  if (typeof amount === "number") {
    if (!Number.isFinite(amount)) return NaN;
    return minorFromDecimal(decimalStringFromNumber(amount), digits, true);
  }
  return minorFromDecimal(String(amount ?? "").trim().replace(/[\s,]/g, ""), digits, false);
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
    return `${value.toFixed(digits)} ${code || ""}`.trim();
  }
};

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
    }).format(Number.isFinite(n) ? n : 0);
  } catch {
    return `${(Number.isFinite(n) ? n : 0).toFixed(digits)} ${code || ""}`.trim();
  }
};

export const suggestCurrencyForCountry = (country) => {
  const c = String(country || "").trim().toLowerCase();
  const map = {
    pakistan: "PKR", "united states": "USD", usa: "USD", us: "USD",
    "united kingdom": "GBP", uk: "GBP", england: "GBP",
    "united arab emirates": "AED", uae: "AED", "saudi arabia": "SAR",
    india: "INR", bangladesh: "BDT", canada: "CAD", australia: "AUD",
    germany: "EUR", france: "EUR", spain: "EUR", italy: "EUR", netherlands: "EUR", ireland: "EUR",
    japan: "JPY", qatar: "QAR", kuwait: "KWD", oman: "OMR", bahrain: "BHD"
  };
  return map[c] || null;
};
export const validateCurrencyCode = (code) => {
  const normalized = normalizeCurrencyCode(code);
  if (!BY_CODE.has(normalized)) throw new Error("Unsupported currency code");
  return normalized;
};

export const safelyRoundMoney = (amountMinor) => {
  const n = Number(amountMinor);
  if (!Number.isFinite(n)) throw new Error("Invalid money amount");
  return Math.round(n);
};

export const calculateMoneyTotals = (values = []) => values.reduce((sum, v) => sum + safelyRoundMoney(Number(v || 0)), 0);

export const parseMoneyInput = (value, currencyCode, exponentOverride) => {
  if (value === null || value === undefined || value === "") return null;
  const digits = Number.isInteger(exponentOverride) ? exponentOverride : getCurrencyFractionDigits(currencyCode);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Invalid money amount");
    const raw = decimalStringFromNumber(value);
    const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
    if (decimals > digits) throw new Error(`Invalid money amount: ${digits} decimal place(s) allowed`);
    const minor = minorFromDecimal(raw, digits, false);
    if (!Number.isSafeInteger(minor)) throw new Error("Invalid money amount");
    return minor;
  }
  const raw = String(value).trim().replace(/[\s,]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new Error("Invalid money amount");
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  if (decimals > digits) throw new Error(`Invalid money amount: ${digits} decimal place(s) allowed`);
  const minor = toMinorUnits(raw, currencyCode, digits);
  if (!Number.isSafeInteger(minor)) throw new Error("Invalid money amount");
  return minor;
};
