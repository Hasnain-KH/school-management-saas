import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const css = read("../src/styles.css");
const shell = read("../src/components/PortalShell.jsx");
const manager = read("../src/pages/SchoolLogoManager.jsx");
const renderer = read("../src/components/SchoolLogo.jsx");

test("shared logo frame is circular, square and preserves image aspect ratio", () => {
  assert.match(css, /\.school-logo\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(css, /\.school-logo--circle\s*\{[^}]*border-radius:\s*50%/);
  assert.match(css, /\.school-logo\s+img\s*\{[^}]*object-fit:\s*contain/);
  assert.match(css, /\.logo-preview\s*\{[^}]*border-radius:\s*50%/);
  assert.doesNotMatch(css, /object-fit:\s*cover/);
});

test("image is fitted to the circle's inscribed square with balanced padding", () => {
  const imageRule = css.match(/\.school-logo img\s*\{[^}]*\}/)?.[0] ?? "";
  assert.match(imageRule, /top:\s*var\(--logo-fit-inset,\s*16%\)/);
  assert.match(imageRule, /left:\s*var\(--logo-fit-inset,\s*16%\)/);
  assert.match(imageRule, /width:\s*calc\(100%\s*-\s*2\s*\*\s*var\(--logo-fit-inset,\s*16%\)\)/);
  assert.match(imageRule, /height:\s*calc\(100%\s*-\s*2\s*\*\s*var\(--logo-fit-inset,\s*16%\)\)/);
  assert.match(imageRule, /padding:\s*var\(--logo-frame-padding,\s*1px\)/);
  assert.match(imageRule, /box-sizing:\s*border-box/);
  assert.doesNotMatch(imageRule, /inset:\s*0/);
  assert.doesNotMatch(imageRule, /border-radius:\s*inherit/);
  assert.doesNotMatch(css, /clip-path/);
});

test("logo previews use the same restrained padding as compact frames", () => {
  const previewRule = css.match(/\.logo-preview\s*\{[^}]*\}/)?.[0] ?? "";
  assert.match(previewRule, /--logo-frame-padding:\s*2px/);
  assert.doesNotMatch(previewRule, /--logo-frame-padding:\s*7px/);
});

test("header and sidebar profile locations use the shared renderer", () => {
  assert.match(shell, /className="topbar-avatar"[\s\S]*?<SchoolLogo[\s\S]*?<\/button>/);
  assert.match(shell, /className="profile-avatar"[\s\S]*?<SchoolLogo[\s\S]*?<\/span>/);
  assert.match(shell, /<SchoolLogo\s+className="brand-mark"/);
  assert.match(shell, /<SchoolLogo\s+className="school-avatar"/);
});

test("all five branding locations share the same renderer", () => {
  assert.match(shell, /<SchoolLogo\s+className="brand-mark"/);
  assert.match(shell, /<SchoolLogo\s+className="school-avatar"/);
  assert.match(shell, /className="topbar-avatar"[\s\S]*?>\s*<SchoolLogo/);
  assert.match(shell, /className="profile-avatar"[\s\S]*?>\s*<SchoolLogo/);
  assert.match(manager, /<span className="logo-preview">[\s\S]*?<SchoolLogo[\s\S]*?<\/span>/);
  assert.match(manager, /<SchoolLogo\s+school=\{school\}/);
});

test("upload preview uses the original object URL and keeps upload/remove contracts", () => {
  assert.match(manager, /<SchoolLogo\s+src=\{pending\.url\}/);
  assert.match(manager, /post\("\/schools\/me\/logo"/);
  assert.match(manager, /del\("\/schools\/me\/logo"\)/);
  assert.doesNotMatch(manager, /toDataURL|createImageBitmap|canvas|sharp|resize/);
});

test("renderer keeps versioned cache-busting and resets load failures on URL change", () => {
  assert.match(renderer, /encodeURIComponent\(school\.logo\.version\)/);
  assert.match(renderer, /useEffect\(\(\) => \{ setFailed\(false\); \}, \[url\]\)/);
  assert.match(renderer, /onError=\{\(\) => setFailed\(true\)\}/);
});
