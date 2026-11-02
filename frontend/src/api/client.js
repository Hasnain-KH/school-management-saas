const API_BASE = (
  import.meta.env.VITE_API_URL
  || (import.meta.env.DEV ? "http://localhost:5000/api/v1" : "/api/v1")
).replace(/\/$/, "");

if (typeof window !== "undefined") {
  window.sessionStorage.removeItem("schoolflow.access");
  window.sessionStorage.removeItem("schoolflow.refresh");
}

export class ApiError extends Error {
  constructor(message, status, errors = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

let csrfToken;
let refreshRequest;
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const authEndpoints = new Set(["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"]);

const getCsrfToken = async () => {
  if (csrfToken) return csrfToken;
  const response = await fetch(`${API_BASE}/auth/csrf`, { credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success || typeof body.data?.csrfToken !== "string") {
    throw new ApiError(body.message || "Unable to initialize request security", response.status);
  }
  csrfToken = body.data.csrfToken;
  return csrfToken;
};

const sendRefreshRequest = async () => {
  const token = await getCsrfToken();
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": token }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) {
    throw new ApiError(body.message || "Session expired", response.status);
  }
};

const refreshAccess = async () => {
  if (!refreshRequest) {
    refreshRequest = (async () => {
      try {
        if (navigator.locks?.request) {
          await navigator.locks.request("schoolflow-session-refresh", sendRefreshRequest);
        } else {
          await sendRefreshRequest();
        }
        return true;
      } catch {
        csrfToken = undefined;
        window.dispatchEvent(new Event("schoolflow:session-expired"));
        return false;
      } finally {
        refreshRequest = undefined;
      }
    })();
  }
  return refreshRequest;
};

export async function api(path, options = {}, canRefresh = true) {
  const headers = new Headers(options.headers || {});
  const method = (options.method || "GET").toUpperCase();
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (unsafeMethods.has(method)) headers.set("X-CSRF-Token", await getCsrfToken());

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    credentials: "include",
    headers
  });
  if (response.status === 401 && canRefresh && !authEndpoints.has(path)) {
    if (await refreshAccess()) return api(path, options, false);
    window.dispatchEvent(new Event("schoolflow:session-expired"));
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new ApiError(body.message || "The request could not be completed", response.status, body.errors || []);
  }
  if (path === "/auth/csrf" && typeof body.data?.csrfToken === "string") {
    csrfToken = body.data.csrfToken;
  }
  return body.data;
}

export const get = (path) => api(path);
export const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body) });
export const patch = (path, body) => api(path, { method: "PATCH", body: JSON.stringify(body) });
export const put = (path, body) => api(path, { method: "PUT", body: JSON.stringify(body) });
export const del = (path) => api(path, { method: "DELETE" });

export const queryString = (params) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  return query.size ? `?${query}` : "";
};
