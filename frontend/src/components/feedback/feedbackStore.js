/**
 * Tiny external store for SchoolFlow dialogs and toasts.
 *
 * It has no React dependency so queue, deduplication, and dismissal behavior can
 * be tested with the dependency-free Node suite. Existing page code keeps using
 * its current Notice/ConfirmDialog handlers; this powers the shared feedback
 * API and its single host in App.jsx.
 */
export const TOAST_VISIBLE_LIMIT = 3;
export const TOAST_EXIT_MS = 160;
export const TOAST_DURATIONS = Object.freeze({
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 8000,
  loading: 0
});

let state = { dialogs: [], toasts: [], nextId: 1 };
const listeners = new Set();
const timers = new Map();
const exitTimers = new Map();

const emit = () => {
  for (const listener of listeners) listener();
};

const getSnapshot = () => state;

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const nextId = (prefix) => `${prefix}-${state.nextId++}`;

const clearToastTimer = (id) => {
  const timer = timers.get(id);
  if (!timer) return;
  clearTimeout(timer.timeout);
  timers.delete(id);
};

const syncToastTimers = () => {
  const visible = state.toasts.slice(0, TOAST_VISIBLE_LIMIT);
  const visibleIds = new Set(visible.map((toast) => toast.id));
  for (const id of [...timers.keys()]) {
    if (!visibleIds.has(id)) clearToastTimer(id);
  }
  for (const toast of visible) {
    if (toast.exiting || toast.duration <= 0 || toast.paused || timers.has(toast.id)) continue;
    const timeout = setTimeout(() => dismissToast(toast.id), toast.remaining ?? toast.duration);
    timers.set(toast.id, { timeout, startedAt: Date.now() });
  }
};

const updateToast = (id, patch) => {
  const index = state.toasts.findIndex((toast) => toast.id === id);
  if (index < 0) return;
  const toasts = [...state.toasts];
  toasts[index] = { ...toasts[index], ...patch };
  state = { ...state, toasts };
  emit();
  syncToastTimers();
};

const dismissToast = (id) => {
  clearToastTimer(id);
  const toast = state.toasts.find((item) => item.id === id);
  if (!toast || toast.exiting) return;
  state = {
    ...state,
    toasts: state.toasts.map((item) => item.id === id ? { ...item, exiting: true, paused: true } : item)
  };
  emit();
  const timeout = setTimeout(() => {
    exitTimers.delete(id);
    state = { ...state, toasts: state.toasts.filter((item) => item.id !== id) };
    emit();
    syncToastTimers();
  }, TOAST_EXIT_MS);
  exitTimers.set(id, timeout);
  syncToastTimers();
};

const toastKey = (config) => `${config.type || "info"}:${config.title || ""}:${config.description || ""}`;

const pushToast = (config = {}) => {
  const type = TOAST_DURATIONS[config.type] !== undefined ? config.type : "info";
  const duration = config.duration !== undefined ? Number(config.duration) : TOAST_DURATIONS[type];
  const key = toastKey({ ...config, type });
  const existing = state.toasts.find((toast) => toast.key === key && !toast.exiting);

  if (existing) {
    clearToastTimer(existing.id);
    const toasts = state.toasts.map((toast) => toast.id === existing.id
      ? { ...toast, ...config, type, duration, remaining: duration, paused: false }
      : toast);
    state = { ...state, toasts };
    emit();
    syncToastTimers();
    return existing.id;
  }

  const id = nextId("toast");
  state = {
    ...state,
    toasts: [...state.toasts, {
      id,
      key,
      type,
      title: config.title || "",
      description: config.description || "",
      duration: Number.isFinite(duration) ? Math.max(0, duration) : TOAST_DURATIONS.info,
      remaining: Number.isFinite(duration) ? Math.max(0, duration) : TOAST_DURATIONS.info,
      paused: false,
      persistent: config.persistent === true,
      action: config.action
    }]
  };
  emit();
  syncToastTimers();
  return id;
};

/** Immediately remove toasts (no exit delay), used when replacing same-role feedback. */
const clearToasts = (types) => {
  const wanted = Array.isArray(types) ? new Set(types) : types ? new Set([types]) : null;
  const ids = state.toasts
    .filter((toast) => !wanted || wanted.has(toast.type))
    .map((toast) => toast.id);
  if (!ids.length) return;
  const idSet = new Set(ids);
  for (const id of ids) {
    clearToastTimer(id);
    const timer = exitTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      exitTimers.delete(id);
    }
  }
  state = { ...state, toasts: state.toasts.filter((toast) => !idSet.has(toast.id)) };
  emit();
  syncToastTimers();
};

const pauseToast = (id) => {
  const timer = timers.get(id);
  const toast = state.toasts.find((item) => item.id === id);
  if (!toast || toast.exiting) return;
  const elapsed = timer ? Date.now() - timer.startedAt : 0;
  clearToastTimer(id);
  updateToast(id, {
    paused: true,
    remaining: Math.max(0, (toast.remaining ?? toast.duration) - elapsed)
  });
};

const resumeToast = (id) => {
  const toast = state.toasts.find((item) => item.id === id);
  if (!toast || toast.exiting || !toast.paused) return;
  updateToast(id, { paused: false });
};

const enqueueDialog = (config) => {
  const id = nextId("dialog");
  state = { ...state, dialogs: [...state.dialogs, { ...config, id }] };
  emit();
  return id;
};

const closeDialog = (id, outcome) => {
  const dialog = state.dialogs.find((item) => item.id === id);
  state = { ...state, dialogs: state.dialogs.filter((item) => item.id !== id) };
  emit();
  if (dialog && typeof dialog.onResolve === "function") dialog.onResolve(outcome);
};

const statusAlert = (variant) => (config = {}) => enqueueDialog({
  kind: "status",
  variant,
  title: config.title || "Update complete",
  message: config.message || "",
  confirmText: config.confirmText || "Close",
  onResolve: config.onResolve
});

const toastFor = (type) => (config = {}) => {
  if (typeof config === "string") return pushToast({ type, title: config });
  return pushToast({ ...config, type });
};

const toastApi = {
  success: toastFor("success"),
  error: toastFor("error"),
  warning: toastFor("warning"),
  info: toastFor("info"),
  loading: toastFor("loading"),
  dismiss: dismissToast,
  pause: pauseToast,
  resume: resumeToast,
  promise: async (promise, config = {}) => {
    const loading = typeof config.loading === "string" ? { title: config.loading } : (config.loading || { title: "Working…" });
    const id = pushToast({ ...loading, type: "loading", duration: 0 });
    try {
      const result = await promise;
      const success = typeof config.success === "string" ? { title: config.success } : (config.success || { title: "Done" });
      updateToast(id, { ...success, type: "success", duration: TOAST_DURATIONS.success, remaining: TOAST_DURATIONS.success, paused: false });
      return result;
    } catch (error) {
      const failure = typeof config.error === "string" ? { title: config.error } : (config.error || {});
      updateToast(id, {
        ...failure,
        type: "error",
        title: failure.title || "That action could not be completed",
        description: failure.description || error?.message || "Please try again.",
        duration: TOAST_DURATIONS.error,
        remaining: TOAST_DURATIONS.error,
        paused: false
      });
      throw error;
    }
  }
};

export const appFeedback = {
  subscribe,
  getSnapshot,
  confirm: (config = {}) => new Promise((resolve) => enqueueDialog({
    ...config,
    kind: "confirm",
    variant: config.variant || "question",
    title: config.title || "Are you sure?",
    message: config.message || "",
    confirmText: config.confirmText || "Confirm",
    cancelText: config.cancelText || "Cancel",
    onResolve: (outcome) => {
      if (typeof config.onResolve === "function") config.onResolve(outcome);
      resolve(outcome);
    }
  })),
  alert: {
    success: statusAlert("success"),
    error: statusAlert("error"),
    warning: statusAlert("warning"),
    info: statusAlert("info")
  },
  toast: toastApi,
  dismissToast,
  clearToasts,
  pauseToast,
  resumeToast,
  closeDialog
};

/** Test-only reset. Never used by application code. */
export function __resetFeedbackForTests() {
  for (const id of [...timers.keys()]) clearToastTimer(id);
  for (const id of [...exitTimers.keys()]) clearTimeout(exitTimers.get(id));
  exitTimers.clear();
  state = { dialogs: [], toasts: [], nextId: 1 };
  emit();
}
