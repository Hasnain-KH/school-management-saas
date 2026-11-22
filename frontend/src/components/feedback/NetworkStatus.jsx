import { useEffect, useRef, useState } from "react";
import { WifiOff } from "../ui/icon/icons.jsx";
import { notify } from "./appFeedback.js";
import { confirmUnsavedNavigation, hasUnsavedChanges } from "./unsavedChanges.js";

export default function NetworkStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const lastOnline = useRef(online);
  const restoreNotified = useRef(true);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onOffline = () => {
      setOnline(false);
      lastOnline.current = false;
      restoreNotified.current = false;
      notify.warning("Connection lost", { id: "network-offline", description: "You appear to be offline. Check your connection before continuing." });
    };
    const onOnline = () => {
      setOnline(true);
      if (!lastOnline.current && !restoreNotified.current) {
        notify.success("Connection restored", { id: "network-online", description: "You're back online." });
        restoreNotified.current = true;
      }
      lastOnline.current = true;
    };
    const onDocumentClick = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.closest("[data-unsaved-guarded]")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
      if (!hasUnsavedChanges()) return;
      if (!confirmUnsavedNavigation()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (online) return null;
  return <div className="network-banner" role="status" aria-live="polite" aria-atomic="true">
    <WifiOff size={16} aria-hidden="true" />
    <span>You&apos;re offline. Changes may not be saved until your connection returns.</span>
  </div>;
}
