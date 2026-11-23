// Exact provider origins allowed for direct student-media uploads.
// Set VITE_STORAGE_UPLOAD_ORIGINS (comma separated) at build time; never use a wildcard origin.
export function getStorageUploadOrigins() {
  let configured;
  try {
    // Keep this as a direct member expression so Vite's build-time define can replace it.
    configured = import.meta.env.VITE_STORAGE_UPLOAD_ORIGINS;
  } catch {
    return []; // Not running under Vite (for example, in a Node test).
  }
  if (!configured || typeof configured !== "string") return [];
  return configured.split(",").map((origin) => origin.trim()).filter(Boolean);
}
