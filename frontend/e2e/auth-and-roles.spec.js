import { expect, test } from "@playwright/test";

const api = "http://localhost:5000/api/v1";
const roles = [
  { role: "platform_super_admin", name: "Platform Admin", school: null, navigation: "Plans" },
  { role: "school_admin", name: "School Admin", school: { name: "Test School", status: "active", subscription: { plan: "test" } }, navigation: "People" },
  { role: "principal", name: "Principal", school: { name: "Test School", status: "active", subscription: { plan: "test" } }, navigation: "Attendance" },
  { role: "teacher", name: "Teacher", school: { name: "Test School", status: "active", subscription: { plan: "test" } }, navigation: "Timetable" },
  { role: "parent", name: "Parent", school: { name: "Test School", status: "active", subscription: { plan: "test" } }, navigation: "My children" }
];

const respond = (route, status, data, message = "Request completed") =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ success: status < 400, message, data }) });

async function configureRoleApi(page, identity, overrides = {}) {
  let authenticated = false;
  await page.route(`${api}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (Object.hasOwn(overrides, path)) return respond(route, 200, overrides[path]);
    if (path === "/auth/csrf") return respond(route, 200, { csrfToken: "test-csrf-token" });
    if (path === "/auth/login") {
      authenticated = true;
      return respond(route, 200, { user: { id: "test-user", ...identity } });
    }
    if (path === "/auth/refresh" && !authenticated) return respond(route, 401, null, "Session expired");
    if (path === "/auth/me" && !authenticated) return respond(route, 401, null, "Authentication is required");
    if (path === "/auth/me") return respond(route, 200, { user: { id: "test-user", ...identity }, school: identity.school });
    if (path === "/reports/dashboard") return respond(route, 200, {});
    if (path === "/portal/parent/students") return respond(route, 200, []);
    if (path === "/academics/sessions") return respond(route, 200, { items: [] });
    if (path.startsWith("/attendance/staff/me")) return respond(route, 200, {});
    if (path === "/schools/me") return respond(route, 200, { school: identity.school });
    if (path === "/schools/subscription") return respond(route, 200, { plan: null });
    return respond(route, 200, { items: [] });
  });
}

async function signInAs(page, identity, overrides) {
  await configureRoleApi(page, identity, overrides);
  await page.goto("/login");
  if (identity.role !== "platform_super_admin") await page.getByLabel("School workspace").fill("test-school");
  await page.getByLabel("Email address").fill(`${identity.role}@example.test`);
  await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

for (const identity of roles) {
  test(`${identity.role} can sign in and sees role-appropriate navigation`, async ({ page }) => {
    await signInAs(page, identity);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toContainText(identity.navigation);
    if (identity.role === "platform_super_admin") {
      await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();
    } else if (identity.role === "parent") {
      await expect(page.getByRole("heading", { name: /Welcome, Parent/ })).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening),/ })).toBeVisible();
    }
  });
}

test("school admin can open every workspace and each renders an empty state without client errors", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const admin = roles.find(({ role }) => role === "school_admin");
  await signInAs(page, admin);
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  for (const link of ["Students", "People", "Academics", "Attendance", "Fees & finance", "Exams & results", "Inventory", "Fixed assets", "Library", "Calendar", "Announcements", "Reports", "Subscription", "School profile", "Audit log"]) {
    await navigation.getByRole("link", { name: link, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  }
  expect(pageErrors).toEqual([]);
});

test("login displays API rejection without storing a browser-readable token", async ({ page }) => {
  await page.route(`${api}/auth/csrf`, (route) => respond(route, 200, { csrfToken: "test-csrf-token" }));
  await page.route(`${api}/auth/login`, (route) => respond(route, 401, null, "Invalid credentials"));
  await page.goto("/login");
  await page.getByLabel("Email address").fill("user@example.test");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid credentials");
  await expect(page).toHaveURL("/login");
  expect(await page.evaluate(() => [...Object.keys(sessionStorage), ...Object.keys(localStorage)])).toEqual([]);
});

test("school registration surfaces API provisioning errors", async ({ page }) => {
  await page.route(`${api}/auth/csrf`, (route) => respond(route, 200, { csrfToken: "test-csrf-token" }));
  await page.route(`${api}/auth/register`, (route) => respond(route, 503, null, "School registration is temporarily unavailable"));
  await page.goto("/register");
  await page.getByLabel("School name").fill("Test Academy");
  await page.getByLabel("Administrator name").fill("School Owner");
  await page.getByLabel("Work email").fill("owner@example.test");
  await page.getByLabel("Password").fill("a-strong-password-123");
  await page.getByRole("button", { name: "Create school workspace" }).click();
  await expect(page.getByRole("alert")).toContainText("temporarily unavailable");
});

test("password recovery presents generic success feedback", async ({ page }) => {
  await page.route(`${api}/auth/csrf`, (route) => respond(route, 200, { csrfToken: "test-csrf-token" }));
  await page.route(`${api}/auth/password-recovery`, (route) => respond(route, 200, {}));
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill("owner@example.test");
  await page.getByRole("button", { name: "Send recovery instructions" }).click();
  await expect(page.getByRole("status")).toContainText("If the account exists");
});

test("login remains usable at a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});

test("shared dialogs focus the form, trap keyboard navigation, and restore focus", async ({ page }) => {
  const admin = roles.find(({ role }) => role === "school_admin");
  await signInAs(page, admin);
  await page.getByRole("link", { name: "Fixed assets" }).click();
  const openButton = page.getByRole("button", { name: "Record asset" });
  await openButton.click();
  const dialog = page.getByRole("dialog", { name: "Record fixed asset" });
  await expect(dialog).toBeVisible();
  const assetTag = page.getByLabel("Asset tag");
  await expect(assetTag).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Record asset" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(openButton).toBeFocused();
});

test("school workspace stays within a narrow mobile viewport", async ({ page }) => {
  const admin = roles.find(({ role }) => role === "school_admin");
  await signInAs(page, admin);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const link of ["Overview", "Students", "Academics", "Attendance", "Fees & finance", "Exams & results", "Fixed assets", "Reports"]) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: link, exact: true }).click();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, `${link} should not create horizontal page overflow`).toBeLessThanOrEqual(390);
  }
});

test("parent workspace renders real child records in readable tables", async ({ page }) => {
  const parent = roles.find(({ role }) => role === "parent");
  const child = { id: "child-1", firstName: "Taylor", lastName: "Student", admissionNumber: "ST-001", status: "enrolled" };
  await signInAs(page, parent, {
    "/portal/parent/students": [child],
    "/portal/parent/students/child-1/attendance": [{ date: "2025-01-15T00:00:00.000Z", status: "present", checkIn: null, checkOut: null, note: "" }]
  });
  await page.getByRole("link", { name: "My children" }).click();
  await expect(page.getByRole("combobox", { name: "Student" })).toContainText("Taylor Student");
  await expect(page.getByRole("table")).toContainText("present");
  await expect(page.locator("pre.report-json")).toHaveCount(0);
});
