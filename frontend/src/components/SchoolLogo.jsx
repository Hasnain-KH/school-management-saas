import { useEffect, useState } from "react";
import { School } from "./ui/icon/icons.jsx";
import { API_BASE } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.jsx";

// Version is part of the URL so an uploaded/removed logo refreshes immediately
// without a sign-out, even if the browser cached an earlier image.
export const schoolLogoUrl = (school) => school?.logo?.version
  ? `${API_BASE}/schools/me/logo?v=${encodeURIComponent(school.logo.version)}`
  : "";

export default function SchoolLogo({ className = "", size = 19, school: schoolProp, label, fallback, decorative = true }) {
  const { school: authSchool } = useAuth();
  const school = schoolProp ?? authSchool;
  const [failed, setFailed] = useState(false);
  const url = schoolLogoUrl(school);

  useEffect(() => { setFailed(false); }, [url]);

  if (!url || failed) {
    return <span className={`school-logo ${className}`.trim()} aria-hidden={decorative || undefined} title={decorative ? undefined : label}>
      {fallback ?? <School size={size} aria-hidden="true" />}
    </span>;
  }
  return <span className={`school-logo school-logo--image ${className}`.trim()} aria-hidden={decorative || undefined}>
    <img src={url} alt={decorative ? "" : label || `${school?.name || "School"} logo`} onError={() => setFailed(true)} />
  </span>;
}
