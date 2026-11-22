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

// Measures the painted artwork rectangle, not merely the img element. The
// source alpha bounds account for transparent/white margins that object-fit
// would otherwise make the visible logo look much smaller than its box.
const fitMetrics = async (locator, source) => {
  const geometry = await locator.evaluate((frame) => {
    const img = frame.querySelector("img");
    if (!img) return null;
    const frameRect = frame.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    const frameStyle = getComputedStyle(frame);
    const imgStyle = getComputedStyle(img);
    const matrix = new DOMMatrix(imgStyle.transform);
    const transformScale = Math.hypot(matrix.a, matrix.b) || 1;
    const padding = [
      parseFloat(imgStyle.paddingTop) * transformScale, parseFloat(imgStyle.paddingRight) * transformScale,
      parseFloat(imgStyle.paddingBottom) * transformScale, parseFloat(imgStyle.paddingLeft) * transformScale
    ];
    return {
      frameWidth: frameRect.width,
      frameHeight: frameRect.height,
      borderRadius: frameStyle.borderRadius,
      frameBackground: frameStyle.backgroundColor,
      borderWidth: parseFloat(frameStyle.borderTopWidth),
      objectFit: imgStyle.objectFit,
      objectPosition: imgStyle.objectPosition,
      padding,
      transformScale,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      contentWidth: imgRect.width - padding[3] - padding[1],
      contentHeight: imgRect.height - padding[0] - padding[2],
      contentLeft: imgRect.left - frameRect.left + padding[3],
      contentTop: imgRect.top - frameRect.top + padding[0]
    };
  });
  if (!geometry || !source?.alpha) return null;

  const paintedScale = Math.min(
    geometry.contentWidth / geometry.naturalWidth,
    geometry.contentHeight / geometry.naturalHeight
  );
  const bounds = (region) => {
    const width = region.w * paintedScale;
    const height = region.h * paintedScale;
    const left = geometry.contentLeft
      + (geometry.contentWidth - geometry.naturalWidth * paintedScale) / 2
      + region.x * paintedScale;
    const top = geometry.contentTop
      + (geometry.contentHeight - geometry.naturalHeight * paintedScale) / 2
      + region.y * paintedScale;
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    const corners = [[left, top], [left + width, top], [left, top + height], [left + width, top + height]];
    const maxCornerDistance = Math.max(...corners.map(([x, y]) =>
      Math.hypot(x - geometry.frameWidth / 2, y - geometry.frameHeight / 2)));
    return {
      width, height, left, top, centerX, centerY,
      fillRatio: Math.max(width, height) / geometry.frameWidth,
      centerOffsetX: centerX - geometry.frameWidth / 2,
      centerOffsetY: centerY - geometry.frameHeight / 2,
      aspectError: Math.abs(width / height - region.w / region.h),
      clearance: geometry.frameWidth / 2 - geometry.borderWidth - maxCornerDistance
    };
  };

  const artwork = bounds(source.alpha);
  const nonWhite = bounds(source.nonWhite ?? source.alpha);
  return {
    ...geometry,
    artWidth: artwork.width,
    artHeight: artwork.height,
    fillRatio: artwork.fillRatio,
    centerOffsetX: artwork.centerOffsetX,
    centerOffsetY: artwork.centerOffsetY,
    aspectError: artwork.aspectError,
    clearance: artwork.clearance,
    nonWhiteFillRatio: nonWhite.fillRatio
  };
};

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
  expect(metrics.fillRatio).toBeGreaterThan(0.6);
  expect(metrics.fillRatio).toBeLessThan(0.72);
};

// Creates real PNG sources for the image shapes that commonly expose fitting
// problems: square, wide, tall, transparent margins and white margins.
async function createLogoPng(page, kind) {
  const specs = {
    square: [240, 240, "circle", 0.45, true],
    landscape: [480, 160, "rect", 0.82, true],
    portrait: [160, 480, "rect", 0.82, true],
    transparent: [400, 400, "rect", 0.25, true],
    whitespace: [400, 400, "rect", 0.25, false]
  };
  const [width, height, shape, markScale, transparentBackground] = specs[kind];
  const dataUrl = await page.evaluate(({ width, height, shape, markScale, transparentBackground }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, width, height);
    if (!transparentBackground) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.fillStyle = "#1f6f8b";
    if (shape === "circle") {
      context.beginPath();
      context.arc(width / 2, height / 2, Math.min(width, height) * markScale, 0, Math.PI * 2);
      context.fill();
    } else {
      const markWidth = Math.round(width * markScale);
      const markHeight = Math.round(height * markScale);
      context.fillRect(
        Math.round((width - markWidth) / 2),
        Math.round((height - markHeight) / 2),
        markWidth,
        markHeight
      );
    }
    return canvas.toDataURL("image/png");
  }, { width, height, shape, markScale, transparentBackground });

  const source = await page.evaluate((src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      const bounds = (matches) => {
        let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            const index = (y * canvas.width + x) * 4;
            if (!matches(data[index], data[index + 1], data[index + 2], data[index + 3])) continue;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
        }
        if (maxX < 0) return null;
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        return { x: minX, y: minY, w, h, centerX: (minX + w / 2) / canvas.width, centerY: (minY + h / 2) / canvas.height };
      };
      resolve({
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        alpha: bounds((r, g, b, a) => a > 8),
        nonWhite: bounds((r, g, b, a) => a > 8 && !(r > 245 && g > 245 && b > 245))
      });
    };
    image.onerror = reject;
    image.src = src;
  }), dataUrl);

  return { kind, width, height, buffer: Buffer.from(dataUrl.split(",")[1], "base64"), source };
}

async function waitForSavedLogo(page, version, width, height, minimum = 5) {
  await page.waitForFunction(({ version, width, height, minimum }) => {
    const images = [...document.querySelectorAll(".school-logo img")];
    return images.length >= minimum && images.every((image) =>
      image.complete && image.naturalWidth === width && image.naturalHeight === height
      && image.src.includes(`v=${version}`)
    );
  }, { version, width, height, minimum });
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
        return route.fulfill({
          status: 200,
          contentType: "image/png",
          body: state.logoBuffer,
          headers: {
            "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
            "Access-Control-Allow-Credentials": "true",
            "Cache-Control": "no-store"
          }
        });
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
  const state = await signIn(page);
  await page.goto("/school");
  const logo = await createLogoPng(page, "square");
  await page.getByLabel("Choose a logo image").setInputFiles({
    name: "mobile.png", mimeType: "image/png", buffer: logo.buffer
  });
  await page.getByRole("button", { name: "Save logo" }).click();
  await expect(page.getByRole("status")).toContainText("uploaded successfully");
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

  await waitForSavedLogo(page, state.school.logo.version, logo.width, logo.height, 4);
  for (const selector of [
    ".brand-mark", ".school-avatar", ".topbar-avatar .school-logo", ".profile-avatar .school-logo"
  ]) {
    expectWellFitted(await fitMetrics(page.locator(selector), logo.source));
  }

  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(fits).toBe(true);
});

test("all five locations fit square, landscape, portrait, transparent and white-margin logos", async ({ page }) => {
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
    const pendingMetrics = await fitMetrics(page.locator(".logo-preview .school-logo"), image.source);
    expectWellFitted(pendingMetrics);

    if (kind === "transparent") {
      // Transparent margins are non-destructively discounted, so the painted
      // artwork itself now fills the circle-safe area.
      expect(pendingMetrics.nonWhiteFillRatio).toBeGreaterThan(0.6);
    }
    if (kind === "whitespace") {
      // White margins may be legitimate artwork. The complete source is kept
      // and the painted blue mark remains small; it is never auto-trimmed.
      expect(pendingMetrics.nonWhiteFillRatio).toBeLessThan(0.25);
      expect(pendingMetrics.fillRatio - pendingMetrics.nonWhiteFillRatio).toBeGreaterThan(0.35);
    }

    await page.getByRole("button", { name: "Save logo" }).click();
    await expect(page.getByRole("status")).toContainText("uploaded successfully");
    await waitForSavedLogo(page, state.school.logo.version, image.width, image.height);

    for (const selector of savedLocations) {
      expectWellFitted(await fitMetrics(page.locator(selector), image.source));
    }
  }
  expect(errors).toEqual([]);
});

test.describe("dark theme logo presentation", () => {
  test.use({ colorScheme: "dark" });

  test("logo frames keep a neutral background, subtle border and circle-safe fit", async ({ page }) => {
    const state = await signIn(page);
    await page.goto("/school");
    const logo = await createLogoPng(page, "square");
    await page.getByLabel("Choose a logo image").setInputFiles({
      name: "dark.png", mimeType: "image/png", buffer: logo.buffer
    });
    await page.getByRole("button", { name: "Save logo" }).click();
    await expect(page.getByRole("status")).toContainText("uploaded successfully");
    await waitForSavedLogo(page, state.school.logo.version, logo.width, logo.height);

    for (const selector of [
      ".brand-mark",
      ".school-avatar",
      ".topbar-avatar .school-logo",
      ".profile-avatar .school-logo",
      ".logo-preview .school-logo"
    ]) {
      const metrics = await fitMetrics(page.locator(selector), logo.source);
      expectWellFitted(metrics);
      expect(metrics.frameBackground).not.toBe("rgba(0, 0, 0, 0)");
      expect(metrics.borderWidth).toBe(1);
    }
  });
});
