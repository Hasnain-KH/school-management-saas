import { useEffect, useState } from "react";
import { School } from "./ui/icon/icons.jsx";
import { API_BASE } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.jsx";

// Version is part of the URL so an uploaded/removed logo refreshes immediately
// without a sign-out, even if the browser cached an earlier image.
export const schoolLogoUrl = (school) => school?.logo?.version
  ? `${API_BASE}/schools/me/logo?v=${encodeURIComponent(school.logo.version)}`
  : "";

// Shared, circular logo renderer. `src` is only used by the upload preview so
// the original object URL can be shown without re-encoding or uploading it.
export default function SchoolLogo({
  className = "",
  size = 19,
  school: schoolProp,
  src,
  label,
  fallback,
  decorative = true,
  circle = true
}) {
  const { school: authSchool } = useAuth();
  const school = schoolProp ?? authSchool;
  const [failed, setFailed] = useState(false);
  const url = src || schoolLogoUrl(school);

  useEffect(() => { setFailed(false); }, [url]);

  const classes = [
    "school-logo",
    circle && "school-logo--circle",
    !failed && url && "school-logo--image",
    className
  ].filter(Boolean).join(" ");

  if (!url || failed) {
    return <span className={classes} aria-hidden={decorative || undefined} title={decorative ? undefined : label}>
      {fallback ?? <School size={size} aria-hidden="true" />}
    </span>;
  }
  return <span className={classes} aria-hidden={decorative || undefined}>
    <img src={url} alt={decorative ? "" : label || `${school?.name || "School"} logo`} onError={() => setFailed(true)} />
  </span>;
}
