import assert from "node:assert/strict";
import test from "node:test";

function createWindowMock() {
  const listeners = new Map();
  return {
    confirmCalls: [],
    confirm(value) { this.confirmCalls.push(value); return value === "yes"; },
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); },
    dispatch(type, event) { listeners.get(type)?.(event); },
    listeners
  };
}

test("unsaved changes registry tracks dirty sources and confirms navigation", async () => {
  globalThis.window = createWindowMock();
  const mod = await import(`../src/components/feedback/unsavedChanges.js?test=${Date.now()}`);
  mod.setUnsavedSource("a", false, "msg");
  assert.equal(mod.hasUnsavedChanges(), false);
  assert.equal(mod.confirmUnsavedNavigation(), true);

  mod.setUnsavedSource("a", true, "Unsaved A");
  assert.equal(mod.hasUnsavedChanges(), true);
  globalThis.window.confirm = () => false;
  assert.equal(mod.confirmUnsavedNavigation(), false);
  globalThis.window.confirm = () => true;
  assert.equal(mod.confirmUnsavedNavigation(), true);
  assert.match(mod.getUnsavedMessage(), /Unsaved A/);

  mod.setUnsavedSource("a", false, "Unsaved A");
  assert.equal(mod.hasUnsavedChanges(), false);
});

test("multiple dirty sources keep registry dirty until all cleared", async () => {
  globalThis.window = { confirm: () => true, addEventListener() {}, removeEventListener() {} };
  const mod = await import(`../src/components/feedback/unsavedChanges.js?test=${Date.now()}-multi`);
  mod.setUnsavedSource("one", true, "One");
  mod.setUnsavedSource("two", true, "Two");
  assert.equal(mod.hasUnsavedChanges(), true);
  mod.setUnsavedSource("one", false, "One");
  assert.equal(mod.hasUnsavedChanges(), true);
  mod.setUnsavedSource("two", false, "Two");
  assert.equal(mod.hasUnsavedChanges(), false);
});
