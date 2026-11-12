import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { get } from "../api/client.js";

// Lightweight unread indicator for the top bar. Refreshes on mount, when the
// notifications screen reports a change, and on a slow interval.
export default function NotificationBell() {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const result = await get("/notifications/unread-count");
      setUnread(Number(result?.unread) || 0);
    } catch {
      // Silent: a badge failure must never disturb the workspace.
    }
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("schoolflow:notifications-changed", onChange);
    const timer = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener("schoolflow:notifications-changed", onChange);
      clearInterval(timer);
    };
  }, [refresh]);

  return <Link to="/notifications" className="icon-button notification-bell" aria-label={unread ? `${unread} unread notifications` : "Notifications"}>
    <Bell size={19} />
    {unread > 0 && <span className="notification-badge" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
  </Link>;
}
