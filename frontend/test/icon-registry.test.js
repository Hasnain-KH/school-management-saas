import assert from "node:assert/strict";
import test from "node:test";
import {
  createIconProps,
  getConfirmPresentation,
  getIconBadgeClassName,
  getIconButtonProps,
  getNoticeIconName,
  ICON_REGISTRY,
  ICON_SIZES,
  ICON_STROKE_WIDTH,
  resolveIconName
} from "../src/components/ui/icon/registry.js";

test("registry exposes the required semantic sizes and stroke width", () => {
  assert.deepEqual({ ...ICON_SIZES }, { sm: 16, md: 18, nav: 20, lg: 24, xl: 32, "2xl": 40 });
  assert.equal(ICON_STROKE_WIDTH, 1.75);
});

test("registry maps semantic names to Lucide components", () => {
  assert.ok(Object.keys(ICON_REGISTRY).length >= 100);
  for (const name of ["delete", "edit", "search", "notifications", "success", "warning", "error", "info", "loading", "logout"]) {
    assert.ok(ICON_REGISTRY[name], `${name} should be registered`);
  }
  assert.equal(resolveIconName("unknown-name"), "help");
});

test("icon props hide decorative icons and label standalone icons", () => {
  const decorative = createIconProps({ name: "delete", size: "nav" });
  assert.equal(decorative.component, ICON_REGISTRY.delete);
  assert.equal(decorative.size, 20);
  assert.equal(decorative.strokeWidth, 1.75);
  assert.match(decorative.className, /^sf-icon/);
  assert.equal(decorative.accessibility["aria-hidden"], true);

  const labelled = createIconProps({ name: "students", label: "Students" });
  assert.equal(labelled.accessibility.role, "img");
  assert.equal(labelled.accessibility["aria-label"], "Students");
  assert.equal(labelled.accessibility["aria-hidden"], undefined);
});

test("icon badge and icon button helpers produce consistent accessible markup", () => {
  assert.match(getIconBadgeClassName({ tone: "success", size: 48 }), /icon-badge-success.*icon-badge-48/);
  assert.match(getIconBadgeClassName({ size: 999 }), /icon-badge-40/);

  assert.throws(() => getIconButtonProps({}), /requires a label/);
  const props = getIconButtonProps({ label: "More actions", size: 40 });
  assert.equal(props.type, "button");
  assert.equal(props["aria-label"], "More actions");
  assert.equal(props.title, "More actions");
  assert.equal(props.style["--icon-button-size"], "40px");
});

test("feedback presentation helpers use semantic registry names", () => {
  assert.equal(getNoticeIconName("error"), "error");
  assert.equal(getNoticeIconName("warning"), "warning");
  assert.equal(getNoticeIconName("success"), "success");
  assert.equal(getNoticeIconName("draft"), "info");
  assert.deepEqual(getConfirmPresentation("danger"), { icon: "delete", tone: "danger" });
  assert.deepEqual(getConfirmPresentation("unknown"), { icon: "delete", tone: "danger" });
});
