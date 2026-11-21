#!/usr/bin/env node
/**
 * SchoolFlow icon enforcement.
 *
 * Dependency-free checker for the application-controlled frontend source. It
 * fails on genuine icon-system violations and reports image/CSS-background
 * candidates for manual review (school logos and uploaded assets are allowed).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const CENTRAL_REGISTRY = "src/components/ui/icon/registry.js";
export const SCANNED_EXTENSIONS = new Set([".js", ".jsx", ".css"]);
export const EXCLUDED_DIRECTORY_PARTS = new Set([
  "node_modules", "dist", "build", "coverage", "playwright-report", "test-results", ".git"
]);

const PICTOGRAPHIC_RE = /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
const STANDALONE_GLYPH_RE = /["'](?:[×✓✔✗✘✖⏻★☆]|[→←↑↓])["']/g;
const LUCIDE_SOURCE_RE = /["']lucide-react["']/;
const OTHER_ICON_LIBRARY_RE = /(?:from|import\()\s*["'](?:@fortawesome|react-icons|@heroicons|bootstrap-icons|material-icons|@mdi|phosphor-react|@remixicon|feather-icons|ionicons|@tabler\/icons)[^"']*["']/gi;
const IMPORT_SOURCE_RE = /(?:from|import\()\s*["']([^"']+)["']/g;
const EMOJI_ENTITY_RE = /(?:&(?:check|checkmark|cross|x|heavy_check_mark|warning|bell|phone|email|thumbsup|thumbs_up|rocket);|&#(?:x(?:1f[0-9a-f]+|23f[b-f][0-9a-f]*|26[0-9a-f]+|27[0-9a-f]+)|1f[0-9]+|9[0-9]{4}|10[0-9]{4});)/gi;
const EMOJI_SHORTCODE_RE = /:(?:smile|grinning|joy|heart|fire|warning|check|cross|x|thumbsup|thumbs_up|rocket|bell):/gi;
const ICON_FONT_TOKEN_RE = /^(?:fa[bsrlfd]?|fas|far|fab|fal|fad|iconfont|material-icons|glyphicon|bi|mdi|ri|ion|feather|ti)-/i;
const CLASS_ATTRIBUTE_RE = /(?:className|class)\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g;
const CSS_CONTENT_RE = /content\s*:\s*(["'])(.*?)\1/gi;
const CSS_BACKGROUND_IMAGE_RE = /background(?:-image)?\s*:\s*[^;]*(?:url\(|data:image)[^;]*/gi;

const isRegistry = (relativePath) => relativePath.split(path.sep).join("/") === CENTRAL_REGISTRY;

const lineFor = (content, index) => content.slice(0, index).split("\n").length;
const excerptFor = (content, index) => (content.split("\n")[lineFor(content, index) - 1] || "").trim().slice(0, 180);

const commentLine = (content, index) => {
  const line = (content.split("\n")[lineFor(content, index) - 1] || "").trimStart();
  return line.startsWith("//") || line.startsWith("/*") || line.startsWith("*");
};

/**
 * Scan one source string. Exported for the dependency-free Node tests.
 * `relativePath` must be POSIX-like (e.g. `src/pages/DashboardPage.jsx`).
 */
export function scanSource(content, relativePath) {
  const violations = [];
  const reviews = [];
  const filePath = relativePath.split(path.sep).join("/");
  const isCss = filePath.endsWith(".css");
  const isRegistryFile = isRegistry(relativePath);

  const violate = (index, rule, message) => {
    if (!isCss && commentLine(content, index)) return;
    violations.push({ path: filePath, line: lineFor(content, index), rule, message, excerpt: excerptFor(content, index) });
  };
  const review = (index, rule, message) => {
    reviews.push({ path: filePath, line: lineFor(content, index), rule, message, excerpt: excerptFor(content, index) });
  };

  // 1. Lucide must be imported only from the central registry.
  if (LUCIDE_SOURCE_RE.test(content) && !isRegistryFile) {
    for (const match of content.matchAll(/["']lucide-react["']/g)) {
      violate(match.index, "direct-lucide-import", "Direct lucide-react import outside the central registry.");
    }
  }

  // 2. No other icon libraries.
  for (const match of content.matchAll(OTHER_ICON_LIBRARY_RE)) {
    violate(match.index, "unapproved-icon-library", "Icon import from an unapproved library.");
  }
  for (const match of content.matchAll(IMPORT_SOURCE_RE)) {
    const source = match[1];
    if (source === "lucide-react" || source.startsWith(".") || source.startsWith("/")) continue;
    if (/icon/i.test(source) && !source.startsWith("@vitejs") && !source.startsWith("lucide")) {
      violate(match.index, "unapproved-icon-library", `Unrecognized icon module import: ${source}`);
    }
  }

  // 3. Emoji and pictographic Unicode used as UI chrome.
  for (const match of content.matchAll(new RegExp(PICTOGRAPHIC_RE.source, "gu"))) {
    violate(match.index, "unicode-icon", `Unapproved pictographic Unicode character: ${match[0]}`);
  }
  for (const match of content.matchAll(STANDALONE_GLYPH_RE)) {
    if (PICTOGRAPHIC_RE.test(match[0])) continue;
    violate(match.index, "unicode-icon", `Unapproved standalone Unicode icon glyph: ${match[0]}`);
  }
  for (const match of content.matchAll(EMOJI_ENTITY_RE)) {
    violate(match.index, "emoji-entity", `Emoji/pictograph HTML entity: ${match[0]}`);
  }
  for (const match of content.matchAll(EMOJI_SHORTCODE_RE)) {
    violate(match.index, "emoji-shortcode", `Emoji shortcode: ${match[0]}`);
  }

  // 4. CSS-generated icon glyphs.
  for (const match of content.matchAll(CSS_CONTENT_RE)) {
    const value = match[2].trim();
    if (PICTOGRAPHIC_RE.test(value) || /^[×✓✔✗✘✖⏻★☆→←↑↓]+$/.test(value)) {
      violate(match.index, "css-pseudo-icon", `CSS pseudo-element icon glyph: ${value}`);
    }
  }

  // 5. Icon-font classes and icon-specific <i> elements.
  for (const match of content.matchAll(CLASS_ATTRIBUTE_RE)) {
    const classValue = match[1] || match[2] || match[3] || "";
    const tokens = classValue.split(/\s+/).filter(Boolean);
    const bad = tokens.find((token) => ICON_FONT_TOKEN_RE.test(token) || token === "iconfont");
    if (bad) violate(match.index, "icon-font-class", `Icon-font class detected: ${bad}`);
  }
  for (const match of content.matchAll(/<i\b[^>]*>/gi)) {
    const tag = match[0];
    const classMatch = tag.match(/class(Name)?\s*=\s*["']([^"']*)["']/i);
    const iconClass = classMatch && /(?:^|\s)(?:fa[bsrlfd-]|fas-|far-|fab-|fal-|fad-|icon|glyphicon|material-icons|bi-|mdi-|ri-|ion-|feather-|ti-)/i.test(classMatch[2]);
    if (/aria-hidden\s*=/.test(tag) || iconClass) {
      violate(match.index, "icon-element", "Icon-specific <i> element detected; use the central Icon component.");
    }
  }

  // 6. Manual-review candidates. These are not failures because school logos,
  //    uploaded documents, and existing report graphics are legitimate.
  for (const match of content.matchAll(/<img\b[^>]*>/gi)) {
    const exception = /school-logo|SchoolLogo|brand-mark|school-avatar/i.test(match[0]) || /SchoolLogo|SchoolLogoManager/i.test(filePath);
    review(match.index, "image-candidate", exception
      ? "School logo image — documented protected exception."
      : "Image element — verify it is user/uploaded content and not a UI icon.");
  }
  for (const match of content.matchAll(CSS_BACKGROUND_IMAGE_RE)) {
    review(match.index, "css-background-candidate", "CSS background image — verify it is not an application UI icon.");
  }

  return { violations, reviews };
}

/** Walk the application source tree and return a combined report. */
export function scanTree(sourceRoot, cwd = process.cwd()) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORY_PARTS.has(entry.name)) continue;
        walk(fullPath);
        continue;
      }
      if (!SCANNED_EXTENSIONS.has(path.extname(entry.name))) continue;
      if (/fixtures?[\\/]/i.test(fullPath) || /\.generated\./i.test(entry.name)) continue;
      files.push(fullPath);
    }
  };
  walk(sourceRoot);

  const report = { violations: [], reviews: [], filesScanned: files.length };
  for (const file of files) {
    const relativePath = path.relative(cwd, file).split(path.sep).join("/");
    const content = readFileSync(file, "utf8");
    const result = scanSource(content, relativePath);
    report.violations.push(...result.violations);
    report.reviews.push(...result.reviews);
  }
  return report;
}

function main() {
  const cwd = process.cwd();
  const sourceRoot = path.join(cwd, "src");
  let report;
  try {
    report = scanTree(sourceRoot, cwd);
  } catch (error) {
    console.error(`check:icons failed to scan source: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`check:icons scanned ${report.filesScanned} frontend source files.`);

  if (report.reviews.length) {
    console.log(`Manual-review candidates (${report.reviews.length}):`);
    for (const item of report.reviews) console.log(`  REVIEW ${item.path}:${item.line} [${item.rule}] ${item.message}`);
  }

  if (report.violations.length) {
    console.error(`Icon violations (${report.violations.length}):`);
    for (const item of report.violations) {
      console.error(`  ${item.path}:${item.line} [${item.rule}] ${item.message}`);
      if (item.excerpt) console.error(`      ${item.excerpt}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("check:icons passed: no application icon violations found.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
