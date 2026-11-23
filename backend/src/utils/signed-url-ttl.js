// All signed download URLs are bounded to the same range as Student Media.
// Provider defaults are a fallback, never an unbounded upper limit.

export const SIGNED_URL_TTL_MIN_SECONDS = 60;
export const SIGNED_URL_TTL_MAX_SECONDS = 3600;
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 900;

export const clampSignedUrlTtl = (value, fallback = DEFAULT_SIGNED_URL_TTL_SECONDS) => {
  const parsed = Number(value);
  const base = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  return Math.min(SIGNED_URL_TTL_MAX_SECONDS, Math.max(SIGNED_URL_TTL_MIN_SECONDS, base));
};
