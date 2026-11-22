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

// Generates a real PNG with the requested dimensions in the browser, so the
// upload preview can be checked against square, landscape and portrait sources.
async function createPng(page, width, height) {
  const dataUrl = await page.evaluate(({ width, height }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#2f5d8c";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(
      Math.floor(width / 4),
      Math.floor(height / 4),
      Math.max(1, Math.floor(width / 2)),
      Math.max(1, Math.floor(height / 2))
    );
    return canvas.toDataURL("image/png");
  }, { width, height });
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

const frameMetrics = (locator) => locator.evaluate((element) => {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return {
    width: rect.width,
    height: rect.height,
    borderRadius: style.borderRadius,
    aspectRatio: style.aspectRatio
  };
});

// Measures the painted image rectangle the same way the browser does for
// object-fit: contain (the image is scaled into the img's padded content box).
const fitMetrics = (locator) => locator.evaluate((frame) => {
  const img = frame.querySelector("img");
  if (!img) return null;
  const frameRect = frame.getBoundingClientRect();
  const imgRect = img.getBoundingClientRect();
  const frameStyle = getComputedStyle(frame);
  const imgStyle = getComputedStyle(img);
  const padding = [
    parseFloat(imgStyle.paddingTop), parseFloat(imgStyle.paddingRight),
    parseFloat(imgStyle.paddingBottom), parseFloat(imgStyle.paddingLeft)
  ];
  const contentWidth = imgRect.width - padding[3] - padding[1];
  const contentHeight = imgRect.height - padding[0] - padding[2];
  const scale = Math.min(contentWidth / img.naturalWidth, contentHeight / img.naturalHeight);
  const renderedWidth = img.naturalWidth * scale;
  const renderedHeight = img.naturalHeight * scale;
  const left = imgRect.left + padding[3] + (contentWidth - renderedWidth) / 2;
  const top = imgRect.top + padding[0] + (contentHeight - renderedHeight) / 2;
  const centerX = frameRect.left + frameRect.width / 2;
  const centerY = frameRect.top + frameRect.height / 2;
  const corners = [
    [left, top], [left + renderedWidth, top],
    [left, top + renderedHeight], [left + renderedWidth, top + renderedHeight]
  ];
  const maxCornerDistance = Math.max(...corners.map(([x, y]) => Math.hypot(x - centerX, y - centerY)));
  return {
    frameWidth: frameRect.width,
    frameHeight: frameRect.height,
    borderRadius: frameStyle.borderRadius,
    frameBackground: frameStyle.backgroundColor,
    borderWidth: parseFloat(frameStyle.borderTopWidth),
    objectFit: imgStyle.objectFit,
    padding,
    renderedWidth,
    renderedHeight,
    centerOffsetX: left + renderedWidth / 2 - centerX,
    centerOffsetY: top + renderedHeight / 2 - centerY,
    aspectError: Math.abs(renderedWidth / renderedHeight - img.naturalWidth / img.naturalHeight),
    clearance: frameRect.width / 2 - parseFloat(frameStyle.borderTopWidth) - maxCornerDistance,
    fillRatio: Math.max(renderedWidth, renderedHeight) / frameRect.width
  };
});

const expectWellFitted = (metrics) => {
  expect(metrics).toBeTruthy();
  expect(Math.abs(metrics.frameWidth - metrics.frameHeight)).toBeLessThanOrEqual(1);
  expect(metrics.borderRadius).toBe("50%");
  expect(metrics.objectFit).toBe("contain");
  expect(Math.max(...metrics.padding) - Math.min(...metrics.padding)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(metrics.centerOffsetX)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(metrics.centerOffsetY)).toBeLessThanOrEqual(0.5);
  expect(metrics.aspectError).toBeLessThan(0.01);
  expect(metrics.clearance).toBeGreaterThan(0);
  expect(metrics.fillRatio).toBeGreaterThan(0.45);
  expect(metrics.fillRatio).toBeLessThan(0.7);
};

// Creates real PNG sources for the image shapes that commonly expose fitting
// problems: square, wide, tall, transparent and whitespace-heavy artwork.
async function createLogoPng(page, kind) {
  const specs = {
    square: [200, 200, false, 0.5],
    landscape: [400, 120, false, 0.5],
    portrait: [120, 400, false, 0.5],
    transparent: [200, 200, true, 0.5],
    whitespace: [400, 400, false, 0.25]
  };
  const [width, height, transparent, markScale] = specs[kind];
  const dataUrl = await page.evaluate(({ width, height, transparent, markScale }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, width, height);
    context.fillStyle = transparent ? "rgba(0,0,0,0)" : "#2f5d8c";
    context.fillRect(0, 0, width, height);
    const markWidth = Math.round(width * markScale);
    const markHeight = Math.round(height * markScale);
    context.fillStyle = transparent ? "#159c7d" : "#ffffff";
    context.fillRect(
      Math.round((width - markWidth) / 2),
      Math.round((height - markHeight) / 2),
      markWidth,
      markHeight
    );
    return canvas.toDataURL("image/png");
  }, { width, height, transparent, markScale });
  return { kind, width, height, buffer: Buffer.from(dataUrl.split(",")[1], "base64") };
}

async function waitForSavedLogo(page, version, width, height) {
  await page.waitForFunction(({ version, width, height }) => {
    const images = [...document.querySelectorAll(".school-logo img")];
    return images.length >= 5 && images.every((image) =>
      image.complete && image.naturalWidth === width && image.naturalHeight === height
      && image.src.includes(`v=${version}`)
    );
  }, { version, width, height });
}

// Mirrors the real API contract: /me/logo is a same-origin byte stream and the
// client never sends a schoolId. All tenant identity comes from the session.
async function signIn(page, { role = "school_admin", logo = null, brokenLogo = false } = {}) {
  const state = { school: baseSchool(logo), calls: [], authenticated: false, brokenLogo, logoBuffer: pngBuffer };
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
        return route.fulfill({ status: 200, contentType: "image/png", body: state.logoBuffer });
      }
      if (request.method() === "POST") {
        const body = request.postDataJSON?.() ?? {};
        state.logoBuffer = Buffer.from(body.dataBase64 ?? PNG_BASE64, "base64");
        state.school = baseSchool({
          version: (state.school.logo?.version ?? 0) + 1,
          contentType: body.contentType ?? "image/png",
          sizeBytes: state.logoBuffer.length,
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

test("the current school logo appears in both header and sidebar profile locations", async ({ page }) => {
  const state = await signIn(page, {
    logo: { version: 7, contentType: "image/png", sizeBytes: pngBuffer.length, fileName: "shared.png" }
  });

  await expect(page.locator(".topbar-avatar .school-logo--image img")).toHaveAttribute("src", /schools\/me\/logo\?v=7/);
  await expect(page.locator(".profile-avatar .school-logo--image img")).toHaveAttribute("src", /schools\/me\/logo\?v=7/);
  expect(state.calls.filter((call) => call.path === "/schools/me/logo" && call.method === "GET").length).toBeGreaterThan(0);
});

test("all displayed logo frames are circular 1:1 containers", async ({ page }) => {
  await signIn(page, {
    logo: { version: 5, contentType: "image/png", sizeBytes: pngBuffer.length, fileName: "round.png" }
  });

  for (const selector of [
    ".brand-mark",
    ".school-avatar",
    ".topbar-avatar .school-logo",
    ".profile-avatar .school-logo"
  ]) {
    const metrics = await frameMetrics(page.locator(selector));
    expect(Math.abs(metrics.width - metrics.height)).toBeLessThanOrEqual(1);
    expect(metrics.borderRadius).toBe("50%");
  }

  for (const selector of [".brand-mark img", ".school-avatar img", ".topbar-avatar img", ".profile-avatar img"]) {
    await expect(page.locator(selector)).toHaveCSS("object-fit", "contain");
  }
});

test("header and sidebar keep the initials fallback when no logo exists", async ({ page }) => {
  await signIn(page);

  await expect(page.locator(".topbar-avatar .school-logo")).toHaveText("T");
  await expect(page.locator(".profile-avatar .school-logo")).toHaveText("T");
  await expect(page.locator(".topbar-avatar img")).toHaveCount(0);
  await expect(page.locator(".profile-avatar img")).toHaveCount(0);
});

test("header and sidebar fall back to initials when the logo request fails", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, {
    brokenLogo: true,
    logo: { version: 2, contentType: "image/png", sizeBytes: pngBuffer.length, fileName: "broken.png" }
  });

  await expect(page.locator(".topbar-avatar .school-logo--image")).toHaveCount(0);
  await expect(page.locator(".profile-avatar .school-logo--image")).toHaveCount(0);
  await expect(page.locator(".topbar-avatar .school-logo")).toHaveText("T");
  await expect(page.locator(".profile-avatar .school-logo")).toHaveText("T");
  expect(errors).toEqual([]);
});

test("upload preview fits square, landscape and portrait images without distortion", async ({ page }) => {
  await signIn(page);
  await page.goto("/school");

  for (const [width, height] of [[120, 120], [240, 120], [120, 240]]) {
    const buffer = await createPng(page, width, height);
    await page.getByLabel("Choose a logo image").setInputFiles({
      name: `logo-${width}x${height}.png`,
      mimeType: "image/png",
      buffer
    });

    const preview = page.getByRole("img", { name: "Selected logo preview" });
    await expect.poll(() => preview.evaluate((image) => image.naturalWidth)).toBe(width);
    await expect.poll(() => preview.evaluate((image) => image.naturalHeight)).toBe(height);
    await expect(preview).toHaveCSS("object-fit", "contain");

    const imageBox = await preview.boundingBox();
    const frameBox = await page.locator(".logo-preview").boundingBox();
    expect(Math.abs(imageBox.width - imageBox.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(frameBox.width - frameBox.height)).toBeLessThanOrEqual(1);
    expect(await page.locator(".logo-preview").evaluate((element) => getComputedStyle(element).borderRadius)).toBe("50%");

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(preview).toHaveCount(0);
  }
});

test("circular logo presentation stays inside the mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, {
    logo: { version: 4, contentType: "image/png", sizeBytes: pngBuffer.length, fileName: "mobile.png" }
  });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.locator(".sidebar")).toHaveClass(/sidebar-open/);

  for (const selector of [".brand-mark", ".school-avatar", ".topbar-avatar", ".profile-avatar"]) {
    await expect(page.locator(selector)).toBeInViewport();
    const box = await page.locator(selector).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(32);
    expect(box.width).toBeLessThanOrEqual(44);
    expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }

  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(fits).toBe(true);
});

test("all five locations fit square, landscape, portrait, transparent and whitespace logos", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = await signIn(page);
  await page.goto("/school");

  const savedLocations = [
    ".brand-mark",
    ".school-avatar",
    ".topbar-avatar .school-logo",
    ".profile-avatar .school-logo",
    ".logo-preview .school-logo"
  ];

  for (const kind of ["square", "landscape", "portrait", "transparent", "whitespace"]) {
    const image = await createLogoPng(page, kind);
    await page.getByLabel("Choose a logo image").setInputFiles({
      name: `${kind}.png`, mimeType: "image/png", buffer: image.buffer
    });

    const preview = page.getByRole("img", { name: "Selected logo preview" });
    await expect.poll(() => preview.evaluate((element) => element.naturalWidth)).toBe(image.width);
    await expect.poll(() => preview.evaluate((element) => element.naturalHeight)).toBe(image.height);
    expectWellFitted(await fitMetrics(page.locator(".logo-preview .school-logo")));

    await page.getByRole("button", { name: "Save logo" }).click();
    await expect(page.getByRole("status")).toContainText("uploaded successfully");
    await waitForSavedLogo(page, state.school.logo.version, image.width, image.height);

    for (const selector of savedLocations) {
      expectWellFitted(await fitMetrics(page.locator(selector)));
    }
  }
  expect(errors).toEqual([]);
});

test.describe("dark theme logo presentation", () => {
  test.use({ colorScheme: "dark" });

  test("logo frames keep a neutral background, subtle border and circle-safe fit", async ({ page }) => {
    const state = await signIn(page, {
      logo: { version: 3, contentType: "image/png", sizeBytes: pngBuffer.length, fileName: "dark.png" }
    });
    await page.goto("/school");
    await waitForSavedLogo(page, state.school.logo.version, 1, 1);

    for (const selector of [
      ".brand-mark",
      ".school-avatar",
      ".topbar-avatar .school-logo",
      ".profile-avatar .school-logo",
      ".logo-preview .school-logo"
    ]) {
      const metrics = await fitMetrics(page.locator(selector));
      expectWellFitted(metrics);
      expect(metrics.frameBackground).not.toBe("rgba(0, 0, 0, 0)");
      expect(metrics.borderWidth).toBe(1);
    }
  });
});
