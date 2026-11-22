import { expect, test } from "@playwright/test";

const api = "http://localhost:5000/api/v1";
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nE8AAAAASUVORK5CYII=";
const pngBuffer = Buffer.from(PNG_BASE64, "base64");
const user = { id: "test-user", role: "school_admin", name: "School Admin", schoolId: "school-1" };

const respond = (route, status, data, message = "Request completed") =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ success: status < 400, message, data }) });

const schoolPayload = (logo) => ({
  id: "school-1",
  name: "Test School",
  slug: "test-school",
  status: "active",
  subscription: { plan: "test", status: "active" },
  logo
});

async function configureApi(page, options = {}) {
  const calls = [];
  const hooks = options.hooks || {};
  let authenticated = false;
  let schoolLogo = options.logo === undefined ? null : options.logo;

  await page.route(`${api}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (request.method() !== "GET") {
      calls.push({ path, method: request.method(), body: request.postDataJSON?.() ?? null });
    }

    if (path === "/auth/csrf") return respond(route, 200, { csrfToken: "test-csrf-token" });
    if (path === "/auth/login") {
      if (options.loginStatus) {
        return respond(route, options.loginStatus, null, options.loginMessage || "Invalid credentials");
      }
      authenticated = true;
      return respond(route, 200, { user });
    }
    if (path === "/auth/logout") {
      authenticated = false;
      if (options.logoutStatus) return respond(route, options.logoutStatus, null, "Logout failed");
      return respond(route, 200, null, "Signed out");
    }
    if (path === "/auth/refresh") return respond(route, 401, null, "Session expired");
    if (path === "/auth/me") {
      if (!authenticated) return respond(route, 401, null, "Authentication is required");
      return respond(route, 200, { user, school: schoolPayload(schoolLogo) });
    }
    if (path === "/schools/me") return respond(route, 200, { school: schoolPayload(schoolLogo) });
    if (path === "/schools/subscription") return respond(route, 200, { plan: null });
    if (path === "/schools/me/logo" && request.method() === "POST") {
      if (hooks.logoPost) {
        return hooks.logoPost(route, request, {
          respond,
          setLogo: (logo) => { schoolLogo = logo; }
        });
      }
      const logo = {
        version: 1,
        fileName: request.postDataJSON?.().fileName || "logo.png",
        contentType: "image/png",
        dataBase64: PNG_BASE64
      };
      schoolLogo = logo;
      return respond(route, 201, { logo }, "Uploaded");
    }
    if (path === "/schools/me/logo" && request.method() === "DELETE") {
      if (hooks.logoDelete) {
        return hooks.logoDelete(route, {
          respond,
          clearLogo: () => { schoolLogo = null; }
        });
      }
      schoolLogo = null;
      return respond(route, 200, null, "Removed");
    }
    if (path === "/academics/sections") {
      return respond(route, 200, { items: [{ _id: "section-1", className: "Grade 5", name: "A", isActive: true }] });
    }
    if (path === "/attendance/students" && request.method() === "GET") {
      return respond(route, 200, {
        items: [
          { student: { id: "student-1", firstName: "Ada", lastName: "Lovelace", admissionNumber: "A001" }, attendance: null },
          { student: { id: "student-2", firstName: "Grace", lastName: "Hopper", admissionNumber: "A002" }, attendance: null }
        ]
      });
    }
    if (path === "/attendance/students" && request.method() === "POST") return respond(route, 201, { marked: 2 });
    return respond(route, 200, { items: [] });
  });

  return { calls };
}

async function signIn(page) {
  await page.goto("/login");
  await page.getByLabel("School workspace").fill("test-school");
  await page.getByLabel("Email address").fill("admin@example.test");
  await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

async function dismissVisibleToasts(page) {
  while (await page.getByRole("button", { name: "Dismiss notification" }).count()) {
    await page.getByRole("button", { name: "Dismiss notification" }).first().click();
    await expect(page.getByRole("button", { name: "Dismiss notification" }).first()).toHaveCount(0);
  }
}

const uploadLogo = (page) => page.getByLabel("Choose a logo image").setInputFiles({
  name: "school-logo.png",
  mimeType: "image/png",
  buffer: pngBuffer
});

test("success waits for the API response before appearing", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  let releaseUpload;
  const gate = new Promise((resolve) => { releaseUpload = resolve; });
  const apiState = await configureApi(page, {
    hooks: {
      async logoPost(route, request, context) {
        await gate;
        const body = request.postDataJSON();
        const logo = { version: 1, fileName: body.fileName, contentType: "image/png", dataBase64: PNG_BASE64 };
        context.setLogo(logo);
        return respond(route, 201, { logo }, "Uploaded");
      }
    }
  });

  await signIn(page);
  await expect(page.getByRole("status")).toContainText("Signed in successfully");
  await dismissVisibleToasts(page);
  await page.goto("/school");
  await uploadLogo(page);
  await page.getByRole("button", { name: "Save logo" }).click();

  await expect(page.getByRole("status").filter({ hasText: "uploaded successfully" })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Uploading logo" })).toBeVisible();
  releaseUpload();
  await expect(page.getByRole("status").filter({ hasText: "uploaded successfully" })).toBeVisible();
  expect(apiState.calls.filter((call) => call.path === "/schools/me/logo" && call.method === "POST")).toHaveLength(1);
  expect(pageErrors).toEqual([]);
});

test("failed mutations show sanitized errors and never show success", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await configureApi(page, {
    hooks: {
      logoPost(route) {
        return respond(route, 500, null, "SECRET database password hunter2");
      }
    }
  });

  await signIn(page);
  await dismissVisibleToasts(page);
  await page.goto("/school");
  await uploadLogo(page);
  await page.getByRole("button", { name: "Save logo" }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("temporarily unavailable");
  await expect(alert).not.toContainText("hunter2");
  await expect(alert).not.toContainText("SECRET");
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("cancel performs no mutation and confirm performs exactly one", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const apiState = await configureApi(page, {
    logo: { version: 2, fileName: "logo.png", contentType: "image/png", dataBase64: PNG_BASE64 }
  });
  const deleteCalls = () => apiState.calls.filter((call) => call.path === "/schools/me/logo" && call.method === "DELETE");

  await signIn(page);
  await dismissVisibleToasts(page);
  await page.goto("/school");

  await page.getByRole("button", { name: "Remove logo" }).click();
  const firstDialog = page.getByRole("dialog");
  await expect(firstDialog).toContainText("Remove school logo?");
  await firstDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(firstDialog).toBeHidden();
  expect(deleteCalls()).toHaveLength(0);

  await page.getByRole("button", { name: "Remove logo" }).click();
  const confirmDialog = page.getByRole("dialog");
  await expect(confirmDialog).toBeVisible();
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const button = [...dialog.querySelectorAll("button")].find((element) => element.textContent.trim() === "Remove logo");
    button.click();
    button.click();
  });

  await expect(page.getByRole("status")).toContainText("logo removed");
  await expect.poll(() => deleteCalls().length).toBe(1);
  expect(pageErrors).toEqual([]);
});

test("client-side validation stays inline and sends no request", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const apiState = await configureApi(page);

  await signIn(page);
  await dismissVisibleToasts(page);
  await page.goto("/attendance");
  await page.locator("tbody tr").first().getByRole("combobox").selectOption("late");
  await page.getByRole("button", { name: "Save attendance" }).click();

  await expect(page.getByRole("alert")).toContainText("check-in time");
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(apiState.calls.some((call) => call.path === "/attendance/students" && call.method === "POST")).toBe(false);
  expect(pageErrors).toEqual([]);
});

test("logout and session expiry each produce one guarded notification", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const apiState = await configureApi(page);

  await signIn(page);
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page.getByRole("status")).toContainText("Signed out successfully");
  await expect(page).toHaveURL("/login");
  expect(apiState.calls.filter((call) => call.path === "/auth/logout")).toHaveLength(1);

  await signIn(page);
  await page.evaluate(() => window.dispatchEvent(new Event("schoolflow:session-expired")));
  await expect(page.getByRole("status")).toContainText("session has expired");
  await expect(page.getByRole("status")).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});

test("guest session checks do not emit an expiry warning", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await configureApi(page);

  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("toasts stay on screen and motion is disabled at 390px with reduced motion", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await configureApi(page);

  await signIn(page);
  const toast = page.getByRole("status");
  await expect(toast).toContainText("Signed in successfully");
  const box = await toast.boundingBox();
  expect(box).toBeTruthy();
  expect(box.y).toBeGreaterThan(422);
  expect(box.y + box.height).toBeLessThanOrEqual(844);

  const animation = {
    toast: await page.locator(".toast").first().evaluate((element) => parseFloat(getComputedStyle(element).animationDuration)),
    frame: await page.locator(".page-frame").first().evaluate((element) => parseFloat(getComputedStyle(element).animationDuration))
  };
  expect(animation.toast).toBeLessThanOrEqual(0.001);
  expect(animation.frame).toBeLessThanOrEqual(0.001);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(pageErrors).toEqual([]);
});
