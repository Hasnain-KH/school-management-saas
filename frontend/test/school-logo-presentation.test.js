import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const css = read("../src/styles.css");
const shell = read("../src/components/PortalShell.jsx");
const manager = read("../src/pages/SchoolLogoManager.jsx");
const renderer = read("../src/components/SchoolLogo.jsx");

const rule = (selector) => css.match(new RegExp(`\\${selector}\\s*\\{[^}]*\\}`))?.[0] ?? "";

test("shared logo frame is circular, square and preserves image aspect ratio", () => {
  assert.match(rule(".school-logo"), /aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(rule(".school-logo--circle"), /border-radius:\s*50%/);
  assert.match(rule(".school-logo img"), /object-fit:\s*contain/);
  assert.match(rule(".logo-preview"), /border-radius:\s*50%/);
  assert.doesNotMatch(css, /object-fit:\s*cover/);
});

test("image uses the circle's inscribed square and a centered content fit", () => {
  const frameRule = rule(".school-logo");
  const imageRule = rule(".school-logo img");
  assert.match(frameRule, /--logo-fit-inset:\s*14\.645%/);
  assert.match(frameRule, /--logo-scale:\s*1/);
  assert.match(frameRule, /--logo-shift-x:\s*0%/);
  assert.match(frameRule, /--logo-shift-y:\s*0%/);
  assert.match(imageRule, /top:\s*var\(--logo-fit-inset\)/);
  assert.match(imageRule, /left:\s*var\(--logo-fit-inset\)/);
  assert.match(imageRule, /width:\s*calc\(100%\s*-\s*2\s*\*\s*var\(--logo-fit-inset\)\)/);
  assert.match(imageRule, /height:\s*calc\(100%\s*-\s*2\s*\*\s*var\(--logo-fit-inset\)\)/);
  assert.match(imageRule, /object-position:\s*center/);
  assert.match(imageRule, /transform-origin:\s*center/);
  assert.match(imageRule, /transform:\s*translate\(var\(--logo-shift-x\),\s*var\(--logo-shift-y\)\)\s*scale\(var\(--logo-scale\)\)/);
  assert.doesNotMatch(imageRule, /inset:\s*0/);
  assert.doesNotMatch(imageRule, /padding:/);
  assert.doesNotMatch(imageRule, /border-radius:\s*inherit/);
  assert.doesNotMatch(css, /clip-path/);
});

test("logo frames stay neutral and free of decorative effects", () => {
  assert.match(rule(".school-logo--circle"), /box-shadow:\s*none/);
  assert.match(rule(".brand-mark"), /box-shadow:\s*none/);
  for (const selector of [".school-logo", ".school-logo--circle", ".school-logo img", ".logo-preview"]) {
    assert.doesNotMatch(rule(selector), /gradient/);
    assert.doesNotMatch(rule(selector), /animation/);
  }
});

test("renderer measures alpha bounds and applies a uniform content transform", () => {
  assert.match(renderer, /ARTWORK_FILL\s*=\s*0\.96/);
  assert.match(renderer, /getImageData/);
  assert.match(renderer, /naturalWidth\s*\|\|\s*source\.width/);
  assert.match(renderer, /createImageBitmap/);
  assert.match(renderer, /onLoad=\{handleLoad\}/);
  assert.match(renderer, /"--logo-scale":\s*fit\.scale/);
  assert.match(renderer, /"--logo-shift-x"/);
  assert.match(renderer, /"--logo-shift-y"/);
  assert.doesNotMatch(renderer, /toDataURL/);
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
  assert.match(renderer, /useEffect\(\(\) => \{\s*setFailed\(false\);\s*setFit\(DEFAULT_FIT\);\s*\}, \[url\]\)/);
  assert.match(renderer, /onError=\{\(\) => setFailed\(true\)\}/);
});
