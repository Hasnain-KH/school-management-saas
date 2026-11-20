import { z } from "zod";
import { SCHOOL_LOGO_CONTENT_TYPES, SCHOOL_LOGO_MAX_BYTES } from "../utils/school-logo.js";

const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;

export const schoolLogoUploadSchema = z.object({
    fileName: z.string().trim().min(1).max(240),
    contentType: z.enum(SCHOOL_LOGO_CONTENT_TYPES),
    dataBase64: z.string()
        .min(1)
        .max(Math.ceil(SCHOOL_LOGO_MAX_BYTES / 3) * 4 + 16)
        .regex(base64Pattern, "File data must be valid base64")
}).strict().refine((value) => {
    const padding = value.dataBase64.endsWith("==") ? 2 : value.dataBase64.endsWith("=") ? 1 : 0;
    const bytes = Math.floor((value.dataBase64.length * 3) / 4) - padding;
    return bytes > 0 && bytes <= SCHOOL_LOGO_MAX_BYTES;
}, { message: `Logo must not exceed ${SCHOOL_LOGO_MAX_BYTES} bytes`, path: ["dataBase64"] });

// Check the actual bytes, not just the declared MIME type, so a renamed
// SVG/HTML/script file can never be persisted as a school logo.
export const detectImageMime = (buffer) => {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return "image/png";
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return "image/jpeg";
    }
    if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
        return "image/webp";
    }
    return null;
};
