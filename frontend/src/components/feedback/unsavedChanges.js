import { useEffect, useId, useSyncExternalStore } from "react";

const listeners = new Set();
let dirtySources = new Map(); // id -> { message }

function emit() { listeners.forEach((listener) => listener()); }
function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function getSnapshot() { return dirtySources.size > 0; }

export function getUnsavedMessage() {
  for (const value of dirtySources.values()) {
    if (value?.message) return value.message;
  }
  return "You have unsaved changes. Leave this page without saving?";
}

export function hasUnsavedChanges() {
  return dirtySources.size > 0;
}

export function setUnsavedSource(id, dirty, message) {
  const had = dirtySources.has(id);
  if (dirty) dirtySources.set(id, { message });
  else dirtySources.delete(id);
  if (had !== dirtySources.has(id) || dirty) emit();
}

export function confirmUnsavedNavigation(message = getUnsavedMessage()) {
  if (!hasUnsavedChanges()) return true;
  return window.confirm(message);
}

export function useUnsavedChanges(dirty, message = "You have unsaved changes. Leave without saving?") {
  const id = useId();
  useEffect(() => {
    setUnsavedSource(id, Boolean(dirty), message);
    return () => setUnsavedSource(id, false, message);
  }, [dirty, id, message]);

  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

export function useHasUnsavedChanges() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
