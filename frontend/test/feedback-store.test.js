import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  appFeedback,
  __resetFeedbackForTests,
  TOAST_DURATIONS,
  TOAST_EXIT_MS,
  TOAST_VISIBLE_LIMIT
} from "../src/components/feedback/feedbackStore.js";
import {
  confirmAction,
  confirmDanger,
  notify,
  safeErrorDescription
} from "../src/components/feedback/appFeedback.js";
import {
  canSubmitFeedback,
  getToastIconName
} from "../src/components/feedback/feedbackHelpers.js";

beforeEach(() => __resetFeedbackForTests());

test("toast durations follow the feedback specification", () => {
  assert.deepEqual({ ...TOAST_DURATIONS }, {
    success: 4000, info: 5000, warning: 6000, error: 8000, loading: 0
  });
  assert.equal(TOAST_VISIBLE_LIMIT, 3);
});

test("toast API normalizes variants and deduplicates identical messages", () => {
  appFeedback.toast.success({ title: "Saved", description: "Plan updated.", duration: 0 });
  appFeedback.toast.success({ title: "Saved", description: "Plan updated.", duration: 0 });
  assert.equal(appFeedback.getSnapshot().toasts.length, 1);

  appFeedback.toast.error({ title: "Needs attention", duration: 0 });
  const types = appFeedback.getSnapshot().toasts.map((toast) => toast.type);
  assert.deepEqual(types, ["success", "error"]);
});

test("toast queue keeps only three visible items", () => {
  for (let index = 0; index < 5; index += 1) {
    appFeedback.toast.info({ title: `Message ${index}`, duration: 0 });
  }
  const { toasts } = appFeedback.getSnapshot();
  assert.equal(toasts.length, 5);
  assert.deepEqual(toasts.slice(0, 3).map((toast) => toast.title), ["Message 0", "Message 1", "Message 2"]);
});

test("confirmation dialog resolves the original outcome exactly once", async () => {
  let resolutions = 0;
  const confirmed = appFeedback.confirm({
    title: "Delete this document?",
    message: "This cannot be undone.",
    onResolve: () => { resolutions += 1; }
  });
  const [dialog] = appFeedback.getSnapshot().dialogs;
  assert.equal(dialog.kind, "confirm");
  assert.equal(dialog.variant, "question");
  assert.equal(dialog.confirmText, "Confirm");

  appFeedback.closeDialog(dialog.id, true);
  assert.equal(await confirmed, true);
  assert.equal(resolutions, 1);
  assert.equal(appFeedback.getSnapshot().dialogs.length, 0);
});

test("cancelling a confirmation resolves false without losing queued dialogs", async () => {
  const cancelled = appFeedback.confirm({ title: "Suspend school?" });
  const [first] = appFeedback.getSnapshot().dialogs;
  const secondId = appFeedback.alert.info({ title: "Heads up" });
  appFeedback.closeDialog(first.id, false);
  assert.equal(await cancelled, false);
  assert.equal(appFeedback.getSnapshot().dialogs[0].id, secondId);
});

test("status alerts use the shared dialog queue with semantic variants", () => {
  appFeedback.alert.error({ title: "Upload failed", message: "The file is too large." });
  const [dialog] = appFeedback.getSnapshot().dialogs;
  assert.equal(dialog.kind, "status");
  assert.equal(dialog.variant, "error");
  assert.equal(dialog.message, "The file is too large.");
});

test("feedback guards and toast icon mapping are deterministic", () => {
  assert.equal(canSubmitFeedback({ locked: false, confirming: false }), true);
  assert.equal(canSubmitFeedback({ locked: true }), false);
  assert.equal(canSubmitFeedback({ confirming: true }), false);
  assert.equal(getToastIconName("warning"), "warning");
  assert.equal(getToastIconName("draft"), "info");
});

test("safeErrorDescription maps statuses without exposing backend text", () => {
  assert.match(safeErrorDescription({ status: 400, message: "SECRET" }), /highlighted fields/);
  assert.match(safeErrorDescription({ status: 401, message: "SECRET" }), /session has expired/);
  assert.match(safeErrorDescription({ status: 403 }), /permission/);
  assert.match(safeErrorDescription({ status: 404 }), /not found/);
  assert.match(safeErrorDescription({ status: 409 }), /conflicts/);
  assert.match(safeErrorDescription({ status: 422 }), /highlighted fields/);
  assert.match(safeErrorDescription({ status: 503, message: "SECRET" }), /temporarily unavailable/);
  assert.doesNotMatch(safeErrorDescription({ status: 503, message: "SECRET" }), /SECRET/);
  assert.match(safeErrorDescription(new Error("SECRET")), /temporarily unavailable/);
  assert.equal(safeErrorDescription({ status: 418 }, "Custom fallback"), "Custom fallback");
});

test("notify.error renders sanitized copy instead of the raw API message", () => {
  notify.error({ status: 500, message: "database password = hunter2" }, {
    title: "Upload failed",
    duration: 0
  });
  const [toast] = appFeedback.getSnapshot().toasts;
  assert.equal(toast.type, "error");
  assert.equal(toast.title, "Upload failed");
  assert.doesNotMatch(`${toast.title} ${toast.description}`, /hunter2|database password/);
  assert.match(toast.description, /temporarily unavailable/);
});

test("notify keeps at most one status toast and one alert toast visible", () => {
  notify.success("First", { duration: 0 });
  notify.success("Second", { duration: 0 });
  notify.error({ status: 500 }, { title: "Failed", duration: 0 });

  let toasts = appFeedback.getSnapshot().toasts;
  assert.deepEqual(toasts.map((toast) => [toast.type, toast.title]), [
    ["success", "Second"],
    ["error", "Failed"]
  ]);

  notify.info("Heads up", { duration: 0 });
  toasts = appFeedback.getSnapshot().toasts;
  assert.equal(toasts.some((toast) => toast.type === "success"), false);
  assert.deepEqual(toasts.map((toast) => toast.type), ["error", "info"]);
});

test("toasts enter an exiting state before removal", async () => {
  const id = appFeedback.toast.success({ title: "Saved", duration: 0 });
  appFeedback.dismissToast(id);
  assert.equal(appFeedback.getSnapshot().toasts[0].exiting, true);

  await new Promise((resolve) => setTimeout(resolve, TOAST_EXIT_MS + 20));
  assert.equal(appFeedback.getSnapshot().toasts.length, 0);
});

test("deduplication ignores exiting toasts so repeat actions can notify again", () => {
  const id = appFeedback.toast.success({ title: "Saved", duration: 0 });
  appFeedback.dismissToast(id);
  appFeedback.toast.success({ title: "Saved", duration: 0 });

  const toasts = appFeedback.getSnapshot().toasts;
  assert.equal(toasts.length, 2);
  assert.equal(toasts.filter((toast) => toast.exiting).length, 1);
  appFeedback.clearToasts();
});

test("clearToasts removes immediate toasts without an exit delay", () => {
  appFeedback.toast.success({ title: "Saved", duration: 0 });
  appFeedback.toast.error({ title: "Failed", duration: 0 });
  appFeedback.clearToasts("success");
  assert.deepEqual(appFeedback.getSnapshot().toasts.map((toast) => toast.type), ["error"]);
  appFeedback.clearToasts();
  assert.equal(appFeedback.getSnapshot().toasts.length, 0);
});

test("cancel gates the mutation and emits no success toast", async () => {
  let calls = 0;
  const pending = confirmDanger({
    title: "Remove this document?",
    confirmText: "Remove document",
    onConfirm: async () => { calls += 1; },
    success: { title: "Document removed", duration: 0 }
  });
  const [dialog] = appFeedback.getSnapshot().dialogs;

  appFeedback.closeDialog(dialog.id, false);
  assert.equal(await pending, false);
  assert.equal(calls, 0);
  assert.equal(appFeedback.getSnapshot().toasts.length, 0);
});

test("confirm invokes the mutation once and emits success only after it resolves", async () => {
  let calls = 0;
  let resolveMutation;
  const pending = confirmAction({
    title: "Publish results?",
    confirmText: "Publish",
    onConfirm: () => new Promise((resolve) => { calls += 1; resolveMutation = resolve; }),
    success: { title: "Results published", duration: 0 }
  });
  const [dialog] = appFeedback.getSnapshot().dialogs;

  const confirming = dialog.onConfirm();
  assert.equal(calls, 1);
  assert.equal(appFeedback.getSnapshot().toasts.some((toast) => toast.title === "Results published"), false);

  resolveMutation("published");
  await confirming;
  appFeedback.closeDialog(dialog.id, true);
  assert.equal(await pending, true);
  assert.equal(calls, 1);
  assert.equal(appFeedback.getSnapshot().toasts[0].title, "Results published");
});

test("confirmation failures are sanitized before reaching the dialog", async () => {
  const pending = confirmDanger({
    title: "Suspend school?",
    onConfirm: async () => {
      const error = new Error("SECRET internal stack trace");
      error.status = 500;
      throw error;
    }
  });
  const [dialog] = appFeedback.getSnapshot().dialogs;

  await assert.rejects(dialog.onConfirm(), (reason) => {
    assert.doesNotMatch(reason.message, /SECRET/);
    assert.match(reason.message, /temporarily unavailable/);
    return true;
  });
  appFeedback.closeDialog(dialog.id, false);
  assert.equal(await pending, false);
  assert.equal(appFeedback.getSnapshot().toasts.length, 0);
});

test("notify.promise shows loading first and success only after resolution", async () => {
  let resolveRequest;
  const request = new Promise((resolve) => { resolveRequest = resolve; });
  const pending = notify.promise(() => request, {
    loading: "Saving",
    success: { title: "Saved", duration: 0 }
  });
  assert.deepEqual(appFeedback.getSnapshot().toasts.map((toast) => toast.type), ["loading"]);

  resolveRequest({ ok: true });
  assert.deepEqual(await pending, { ok: true });
  const toasts = appFeedback.getSnapshot().toasts;
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].type, "success");
  assert.equal(toasts[0].title, "Saved");
});
