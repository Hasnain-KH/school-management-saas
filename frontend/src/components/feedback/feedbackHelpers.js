/** Pure behavior helpers for feedback components and their unit tests. */
export function canSubmitFeedback({ locked = false, confirming = false } = {}) {
  return !locked && !confirming;
}

export function getToastIconName(type) {
  return ["success", "warning", "error", "info", "loading"].includes(type) ? type : "info";
}
