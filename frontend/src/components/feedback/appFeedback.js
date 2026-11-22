import { appFeedback as store } from "./feedbackStore.js";

export { appFeedback } from "./feedbackStore.js";

const DEFAULT_ERROR_TITLE = "That action could not be completed";
const TEMPORARY_ERROR = "The service is temporarily unavailable. Please try again.";

const STATUS_MESSAGES = Object.freeze({
  400: "Please check the highlighted fields and try again.",
  401: "Your session has expired. Please sign in again.",
  403: "You do not have permission to do that.",
  404: "The requested record was not found.",
  409: "This action conflicts with the current record. Refresh and try again.",
  422: "Please check the highlighted fields and try again."
});

/** Convert an API/network failure into copy that is safe to display. */
export function safeErrorDescription(error, fallback = TEMPORARY_ERROR) {
  const status = Number(error?.status);
  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];
  if (status >= 500 || !Number.isInteger(status)) return TEMPORARY_ERROR;
  return fallback;
}

function normalizeOptions(options) {
  if (typeof options === "string") return { description: options };
  return options && typeof options === "object" ? options : {};
}

function titleFrom(options, fallback) {
  return options.title || fallback;
}

const STATUS_TYPES = ["success", "info", "warning", "loading"];
const clearStatusToasts = () => store.clearToasts(STATUS_TYPES);

/**
 * Application-facing notification service.
 *
 * Caller-supplied `description` values are treated as reviewed, user-safe copy.
 * Raw `error.message` values from the API are never rendered by this module.
 */
export const notify = {
  success(title, options = {}) {
    const config = normalizeOptions(options);
    clearStatusToasts();
    return store.toast.success({ title, ...config });
  },

  error(error, options = {}) {
    const config = normalizeOptions(options);
    store.clearToasts("error");
    return store.toast.error({
      title: titleFrom(config, DEFAULT_ERROR_TITLE),
      ...config,
      description: config.description || safeErrorDescription(error, config.fallback)
    });
  },

  warning(title, options = {}) {
    const config = normalizeOptions(options);
    clearStatusToasts();
    return store.toast.warning({ title, ...config });
  },

  info(title, options = {}) {
    const config = normalizeOptions(options);
    clearStatusToasts();
    return store.toast.info({ title, ...config });
  },

  loading(title, options = {}) {
    const config = normalizeOptions(options);
    clearStatusToasts();
    return store.toast.loading({ title, duration: 0, ...config });
  },

  /** Run a longer request with one loading toast that becomes success or error. */
  async promise(request, config = {}) {
    const loading = typeof config.loading === "string"
      ? { title: config.loading }
      : (config.loading || { title: "Working…" });
    const id = store.toast.loading({ duration: 0, ...loading });
    try {
      const result = await request();
      store.clearToasts("loading");
      const success = typeof config.success === "string"
        ? { title: config.success }
        : (config.success || { title: "Done" });
      store.toast.success(success);
      return result;
    } catch (error) {
      store.clearToasts("loading");
      const failure = normalizeOptions(config.error);
      notify.error(error, failure);
      throw error;
    }
  },

  dismiss: store.dismissToast,
  pause: store.pauseToast,
  resume: store.resumeToast
};

function safeConfirmationError(error, options) {
  const description = options?.description || safeErrorDescription(error, options?.fallback);
  const wrapped = new Error(description);
  wrapped.status = error?.status;
  return wrapped;
}

/**
 * Confirmation wrapper. The API operation is passed as `onConfirm` and is only
 * invoked after the user confirms. Failures stay in the dialog as safe copy;
 * success is emitted only after the operation resolves.
 */
export function confirmAction({
  title,
  message = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "question",
  onConfirm,
  success,
  error
}) {
  return store.confirm({
    variant,
    title,
    message,
    confirmText,
    cancelText,
    onConfirm: async () => {
      try {
        const result = await onConfirm?.();
        if (success) {
          const successConfig = typeof success === "string" ? { title: success } : success;
          notify.success(successConfig.title || "Done", successConfig);
        }
        return result;
      } catch (reason) {
        throw safeConfirmationError(reason, normalizeOptions(error));
      }
    }
  });
}

export function confirmDanger(options) {
  return confirmAction({ ...options, variant: options.variant || "danger" });
}
