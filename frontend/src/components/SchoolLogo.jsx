import { useEffect, useState } from "react";
import { School } from "./ui/icon/icons.jsx";
import { API_BASE } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.jsx";

// The base image box is the square inscribed in the circle (70.71% of the
// frame). Artwork is fitted to 96% of that box, leaving a small, even margin
// while keeping the complete source rectangle visible for opaque logos.
const ARTWORK_FILL = 0.96;
const DEFAULT_FIT = { scale: 1, shiftX: 0, shiftY: 0 };

// Version is part of the URL so an uploaded/removed logo refreshes immediately
// without a sign-out, even if the browser cached an earlier image.
export const schoolLogoUrl = (school) => school?.logo?.version
  ? `${API_BASE}/schools/me/logo?v=${encodeURIComponent(school.logo.version)}`
  : "";

const alphaBounds = (pixels, width, height) => {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
};

const boundsFromSource = (source) => {
  // HTMLImageElement.width is the rendered CSS width; ImageBitmap only has
  // width. Prefer intrinsic dimensions so bounds stay in source pixels.
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  if (!width || !height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source, 0, 0, width, height);
  return alphaBounds(context.getImageData(0, 0, width, height).data, width, height);
};

// Reading pixels from a cross-origin logo can taint the canvas. The fallback
// fetches the same versioned URL as a blob and measures that copy; the displayed
// image and its object URL are left untouched.
const measureBounds = async (image) => {
  try {
    return boundsFromSource(image);
  } catch {
    if (typeof createImageBitmap !== "function") return null;
    try {
      const response = await fetch(image.currentSrc || image.src, { credentials: "include" });
      if (!response.ok) return null;
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      try {
        return boundsFromSource(bitmap);
      } finally {
        bitmap.close?.();
      }
    } catch {
      return null;
    }
  }
};

const measureLogoFit = async (image) => {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const box = image.offsetWidth || image.clientWidth;
  if (!width || !height || !box) return null;

  const bounds = await measureBounds(image);
  if (!bounds) return null;

  const sourceScale = Math.min(box / width, box / height);
  const artWidth = bounds.w * sourceScale;
  const artHeight = bounds.h * sourceScale;
  if (artWidth <= 0 || artHeight <= 0) return null;

  const scale = (box * ARTWORK_FILL) / Math.max(artWidth, artHeight);
  const centerX = bounds.x + bounds.w / 2;
  const centerY = bounds.y + bounds.h / 2;
  const shiftX = -scale * ((centerX - width / 2) * sourceScale / box) * 100;
  const shiftY = -scale * ((centerY - height / 2) * sourceScale / box) * 100;

  return { scale, shiftX, shiftY };
};

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
  const [fit, setFit] = useState(DEFAULT_FIT);
  const url = src || schoolLogoUrl(school);

  useEffect(() => {
    setFailed(false);
    setFit(DEFAULT_FIT);
  }, [url]);

  const classes = [
    "school-logo",
    circle && "school-logo--circle",
    !failed && url && "school-logo--image",
    className
  ].filter(Boolean).join(" ");

  const handleLoad = async (event) => {
    const image = event.currentTarget;
    const nextFit = await measureLogoFit(image);
    if (!image.isConnected || image.src !== url || !nextFit) return;
    setFit(nextFit);
  };

  if (!url || failed) {
    return <span className={classes} aria-hidden={decorative || undefined} title={decorative ? undefined : label}>
      {fallback ?? <School size={size} aria-hidden="true" />}
    </span>;
  }
  return <span
    className={classes}
    aria-hidden={decorative || undefined}
    style={{
      "--logo-scale": fit.scale,
      "--logo-shift-x": `${fit.shiftX}%`,
      "--logo-shift-y": `${fit.shiftY}%`
    }}
  >
    <img src={url} alt={decorative ? "" : label || `${school?.name || "School"} logo`} onLoad={handleLoad} onError={() => setFailed(true)} />
  </span>;
}
