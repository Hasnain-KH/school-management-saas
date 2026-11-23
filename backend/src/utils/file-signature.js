// Shared byte-signature checks for uploaded files. A declared Content-Type is
// client-controlled, so every upload path verifies that the actual bytes match
// one of the formats allowed for that Content-Type. Unknown content fails closed.

const SIGNATURES = [
  ["jpeg", (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["png", (b) => b.length >= 8 && b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"],
  ["webp", (b) => b.length >= 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP"],
  ["pdf", (b) => b.length >= 4 && b.subarray(0, 4).toString("ascii") === "%PDF"],
  ["mp4", (b) => b.length >= 12 && b.subarray(4, 8).toString("ascii") === "ftyp"],
  ["webm", (b) => b.length >= 4 && b.subarray(0, 4).toString("hex") === "1a45dfa3"],
  ["zip", (b) => b.length >= 4 && b.subarray(0, 4).toString("hex") === "504b0304"],
  ["ole", (b) => b.length >= 8 && b.subarray(0, 8).toString("hex") === "d0cf11e0a1b11ae1"]
];

const COMPATIBLE = new Map([
  ["image/jpeg", new Set(["jpeg"])],
  ["image/png", new Set(["png"])],
  ["image/webp", new Set(["webp"])],
  ["application/pdf", new Set(["pdf"])],
  ["application/msword", new Set(["ole"])],
  ["application/vnd.ms-excel", new Set(["ole"])],
  ["application/vnd.ms-powerpoint", new Set(["ole"])],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", new Set(["zip"])],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", new Set(["zip"])],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", new Set(["zip"])],
  ["application/zip", new Set(["zip"])],
  ["video/mp4", new Set(["mp4"])],
  ["video/quicktime", new Set(["mp4"])],
  ["video/webm", new Set(["webm"])]
]);

export const detectFileSignature = (buffer) => {
  if (!buffer || buffer.length < 4) return "unknown";
  const found = SIGNATURES.find(([, matches]) => matches(buffer));
  return found ? found[0] : "unknown";
};

export const isDeclaredTypeCompatible = (declaredContentType, detected) => {
  if (!detected || detected === "unknown") return false;
  return COMPATIBLE.get(String(declaredContentType || "").toLowerCase())?.has(detected) ?? false;
};
