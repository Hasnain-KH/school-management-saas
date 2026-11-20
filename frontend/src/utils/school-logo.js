export const SCHOOL_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const SCHOOL_LOGO_ACCEPT = "image/png,image/jpeg,image/webp";
export const SCHOOL_LOGO_FORMAT_LABEL = "PNG, JPG, JPEG or WebP · maximum 2 MB";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

// Detect the real image format from the file header, mirroring the backend
// check. A renamed SVG/HTML file is rejected before it is ever uploaded.
const detectMime = (bytes) => {
  if (!bytes || bytes.length < 12) return null;
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, index) => bytes[index] === byte)) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const text = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  return null;
};

export function validateSchoolLogoFile(file, headerBytes) {
  if (!file) return { ok: false, error: "Choose an image file first." };
  if (!ALLOWED_TYPES.has(file.type)) {
    return { ok: false, error: "Unsupported format. Upload a PNG, JPG, JPEG or WebP image." };
  }
  if (!file.size) return { ok: false, error: "The selected file is empty." };
  if (file.size > SCHOOL_LOGO_MAX_BYTES) {
    return { ok: false, error: "The image is larger than 2 MB. Choose a smaller file." };
  }
  const detected = detectMime(headerBytes);
  if (!detected || detected !== file.type) {
    return { ok: false, error: "The file content does not match a supported image format." };
  }
  return { ok: true, contentType: detected };
}

export async function readLogoHeader(file) {
  if (!file || typeof file.slice !== "function") return null;
  const header = file.slice(0, 12);
  if (typeof header?.arrayBuffer !== "function") return null;
  return new Uint8Array(await header.arrayBuffer());
}

export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      if (comma === -1) return reject(new Error("The file could not be read."));
      resolve(result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}
