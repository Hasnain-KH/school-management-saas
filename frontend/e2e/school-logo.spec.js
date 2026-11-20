import { expect, test } from "@playwright/test";

const api = "http://localhost:5000/api/v1";
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nE8AAAAASUVORK5CYII=";
const pngBuffer = Buffer.from(PNG_BASE64, "base64");

const respond = (route, status, data, message = "Request completed") =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ success: status < 400, message, data }) });

const baseSchool = (logo = null) => ({
  id: "school-1",
  name: "Test School",
  slug: "test-school",
  email: "admin@test-school.example",
  status: "active",
  subscription: { plan: "test", status: "active" },
  logo
});

// Mirrors the real API contract: /me/logo is a same-origin byte stream and the
// client never sends a schoolId. All tenant identity comes from the session.
async function signIn(page, { role = "school_admin", logo = null, brokenLogo = false } = {}) {
  const state = { school: baseSchool(logo), calls: [], authenticated: false, brokenLogo };
  await page.unrouteAll();
  await page.route(`${api}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    state.calls.push({ path, method: request.method(), body: request.method() === "POST" ? request.postDataJSON?.() : null });

    if (path === "/auth/csrf") return respond(route, 200, { csrfToken: "test-csrf-token" });
    if (path === "/auth/login") {
      state.authenticated = true;
      return respond(route, 200, { user: { id: "test-user", role, name: "Test User", schoolId: "school-1" } });
    }
    if (path === "/auth/refresh" && !state.authenticated) return respond(route, 401, null, "Session expired");
    if (path === "/auth/me" && !state.authenticated) return respond(route, 401, null, "Authentication is required");
    if (path === "/auth/me") {
      return respond(route, 200, {
        user: { id: "test-user", role, name: "Test User", schoolId: "school-1" },
        school: state.school
      });
    }
    if (path === "/schools/me") return respond(route, 200, { school: state.school });
    if (path === "/schools/subscription") return respond(route, 200, { plan: null });
    if (path === "/schools/me/logo") {
      if (request.method() === "GET") {
        if (state.brokenLogo) return respond(route, 502, null, "The school logo could not be loaded");
        if (!state.school.logo) return respond(route, 404, null, "This school does not have a logo");
        return route.fulfill({ status: 200, contentType: "image/png", body: pngBuffer });
      }
      if (request.method() === "POST") {
        const body = request.postDataJSON?.() ?? {};
        state.school = baseSchool({
          version: (state.school.logo?.version ?? 0) + 1,
          contentType: body.contentType ?? "image/png",
          sizeBytes: pngBuffer.length,
          fileName: body.fileName ?? "school.png",
          updatedAt: new Date().toISOString()
        });
        return respond(route, 201, { logo: state.school.logo, version: state.school.logo.version }, "School logo uploaded");
      }
      if (request.method() === "DELETE") {
        const wasRemoved = Boolean(state.school.logo);
        state.school = baseSchool(null);
        return respond(route, 200, { removed: wasRemoved }, "School logo removed");
      }
    }
    return respond(route, 200, { items: [] });
  });

  await page.goto("/login");
  await page.getByLabel("School workspace").fill("test-school");
  await page.getByLabel("Email address").fill("user@test-school.example");
  await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
  return state;
}

test("default branding and upload controls are shown when no logo exists", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page);

  await expect(page.locator(".brand-mark.school-logo--image")).toHaveCount(0);
  await expect(page.locator(".brand-mark svg")).toHaveCount(1);

  await page.goto("/school");
  await expect(page.getByRole("heading", { name: "School logo" })).toBeVisible();
  await expect(page.getByText("No logo yet")).toBeVisible();
  await expect(page.getByRole("button", { name: /Upload school logo/ })).toBeVisible();
  await expect(page.getByText(/PNG, JPG, JPEG or WebP/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("admin previews, saves a logo and sees branding update without signing out", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = await signIn(page);
  await page.goto("/school");

  await page.getByLabel("Choose a logo image").setInputFiles({
    name: "school-logo.png",
    mimeType: "image/png",
    buffer: pngBuffer
  });
  await expect(page.getByText("Preview — not saved yet")).toBeVisible();
  await expect(page.getByRole("img", { name: "Selected logo preview" })).toBeVisible();
  await expect(state.calls.find((call) => call.path === "/schools/me/logo" && call.method === "POST")).toBeFalsy();

  await page.getByRole("button", { name: "Save logo" }).click();
  await expect(page.getByRole("status")).toContainText("uploaded successfully");
  await expect(page.getByText("Current logo")).toBeVisible();

  const upload = state.calls.find((call) => call.path === "/schools/me/logo" && call.method === "POST");
  expect(upload).toBeTruthy();
  expect(upload.body.fileName).toBe("school-logo.png");
  expect(upload.body.contentType).toBe("image/png");
  expect(upload.body.dataBase64).toBe(PNG_BASE64);
  expect(upload.body.schoolId).toBeUndefined();

  await expect(page.locator(".brand-mark.school-logo--image img")).toHaveCount(1);
  await expect(page.locator(".school-avatar.school-logo--image img")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("unsupported, oversized and invalid files are rejected in the browser", async ({ page }) => {
  const state = await signIn(page);
  await page.goto("/school");

  await page.getByLabel("Choose a logo image").setInputFiles({
    name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg></svg>")
  });
  await expect(page.getByRole("alert")).toContainText("Unsupported format");

  // Declared PNG but the bytes are HTML — the magic-byte check must still block it.
  await page.getByLabel("Choose a logo image").setInputFiles({
    name: "logo.png", mimeType: "image/png", buffer: Buffer.from("<html>not an image</html>")
  });
  await expect(page.getByRole("alert")).toContainText("content does not match");

  await page.getByLabel("Choose a logo image").setInputFiles({
    name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 1)
  });
  await expect(page.getByRole("alert")).toContainText("larger than 2 MB");

  const uploads = state.calls.filter((call) => call.path === "/schools/me/logo" && call.method === "POST");
  expect(uploads).toEqual([]);
  await expect(page.getByRole("button", { name: "Save logo" })).toHaveCount(0);
});

test("admin can replace and remove a logo, with branding following each change", async ({ page }) => {
  const state = await signIn(page);
  await page.goto("/school");

  const upload = async () => {
    await page.getByLabel("Choose a logo image").setInputFiles({
      name: "school.png", mimeType: "image/png", buffer: pngBuffer
    });
    await page.getByRole("button", { name: "Save logo" }).click();
    await expect(page.getByText("uploaded successfully")).toBeVisible();
  };

  await upload();
  // A second upload replaces the first: the button is now "Replace logo".
  await upload();
  const posts = state.calls.filter((call) => call.path === "/schools/me/logo" && call.method === "POST");
  expect(posts).toHaveLength(2);
  await expect(page.locator(".brand-mark img")).toHaveAttribute("src", /schools\/me\/logo\?v=2/);

  await page.getByRole("button", { name: /Remove logo/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove logo" }).click();
  await expect(page.getByRole("status")).toContainText("logo removed");
  expect(state.calls.some((call) => call.path === "/schools/me/logo" && call.method === "DELETE")).toBe(true);
  await expect(page.locator(".brand-mark.school-logo--image")).toHaveCount(0);
  await expect(page.getByText("No logo yet")).toBeVisible();
});

test("teachers and parents see the same school logo", async ({ page }) => {
  for (const role of ["teacher", "parent"]) {
    const state = await signIn(page, {
      role,
      logo: { version: 4, contentType: "image/png", sizeBytes: pngBuffer.length, fileName: "shared.png" }
    });
    await expect(page.locator(".brand-mark.school-logo--image img")).toHaveCount(1);
    await expect(page.locator(".brand-mark img")).toHaveAttribute("src", /schools\/me\/logo\?v=4/);
    await expect(page.locator(".school-avatar.school-logo--image img")).toHaveCount(1);
    // Read-only roles never call the management endpoints.
    expect(state.calls.some((call) => call.path === "/schools/me/logo" && call.method !== "GET")).toBe(false);
    await page.goto("/login");
    await page.evaluate(() => window.localStorage.clear());
  }
});

test("a broken logo URL falls back to the default icon without crashing", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, {
    brokenLogo: true,
    logo: { version: 2, contentType: "image/png", sizeBytes: pngBuffer.length, fileName: "broken.png" }
  });

  await expect(page.locator(".brand-mark.school-logo--image")).toHaveCount(0);
  await expect(page.locator(".brand-mark svg")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("logo controls remain usable at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto("/school");
  await expect(page.getByRole("heading", { name: "School logo" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Upload school logo/ })).toBeVisible();
  const box = await page.getByRole("button", { name: /Upload school logo/ }).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
});
