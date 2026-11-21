import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  appFeedback,
  __resetFeedbackForTests,
  TOAST_DURATIONS,
  TOAST_VISIBLE_LIMIT
} from "../src/components/feedback/feedbackStore.js";
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
