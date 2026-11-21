import assert from "node:assert/strict";
import test from "node:test";
import { scanSource } from "../scripts/check-icons.mjs";

test("checker accepts a clean centralized icon source", () => {
  const report = scanSource(`
    import { Icon } from "./ui/icon/icons.jsx";
    export const control = <Icon name="delete" size="sm" />;
    export const label = "Students";
  `, "src/components/Clean.jsx");
  assert.equal(report.violations.length, 0);
});

test("checker rejects direct Lucide imports outside the registry", () => {
  const report = scanSource(`import { Trash2 } from "lucide-react";`, "src/pages/Bad.jsx");
  assert.ok(report.violations.some((item) => item.rule === "direct-lucide-import"));
});

test("checker allows Lucide only in the central registry", () => {
  const report = scanSource(`import { Trash2 } from "lucide-react";`, "src/components/ui/icon/registry.js");
  assert.equal(report.violations.length, 0);
});

test("checker rejects pictographic and standalone Unicode icons", () => {
  const report = scanSource(`
    const a = "✓";
    const b = "×";
    const c = "At 3 × 4 scale";
  `, "src/pages/Bad.jsx");
  const glyphs = report.violations.filter((item) => item.rule === "unicode-icon");
  assert.equal(glyphs.length, 2);
  assert.ok(glyphs.some((item) => item.message.includes("✓")));
  assert.ok(glyphs.some((item) => item.message.includes("×")));
});

test("checker rejects icon-font classes and icon-specific i elements", () => {
  const report = scanSource(`
    <div className="fa fa-trash" />
    <i className="material-icons" aria-hidden="true">delete</i>
    <i className="skeleton-bar" />
  `, "src/components/Bad.jsx");
  assert.ok(report.violations.some((item) => item.rule === "icon-font-class"));
  assert.ok(report.violations.some((item) => item.rule === "icon-element"));
  assert.equal(report.violations.filter((item) => item.rule === "icon-element").length, 1);
});

test("checker rejects emoji entities and shortcodes", () => {
  const report = scanSource(`const a = "&check;"; const b = ":thumbsup:";`, "src/pages/Bad.jsx");
  assert.ok(report.violations.some((item) => item.rule === "emoji-entity"));
  assert.ok(report.violations.some((item) => item.rule === "emoji-shortcode"));
});

test("checker reports image and CSS background candidates without failing", () => {
  const report = scanSource(`
    <img src="/logo.png" alt="School logo" className="brand-mark" />
    .hero { background-image: url("/pattern.svg"); }
  `, "src/components/SchoolLogo.jsx");
  assert.equal(report.violations.length, 0);
  assert.ok(report.reviews.some((item) => item.rule === "image-candidate"));
  assert.ok(report.reviews.some((item) => item.rule === "css-background-candidate"));
});
