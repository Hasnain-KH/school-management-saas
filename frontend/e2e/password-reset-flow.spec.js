import { expect, test } from "@playwright/test";

const api = "http://localhost:5000/api/v1";
const syntheticToken = "t".repeat(43);
const newPassword = "A-longer-password-123";

const respond = (route, status, data, message = "Request completed") =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ success: status < 400, message, data }) });

async function configureGuestApi(page, resetResponse = { status: 200 }) {
  let resetPayload;
  await page.route(`${api}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (path === "/auth/csrf") return respond(route, 200, { csrfToken: "test-csrf-token" });
    if (path === "/auth/me") return respond(route, 401, null, "Authentication is required");
    if (path === "/auth/refresh") return respond(route, 401, null, "Session expired");
    if (path === "/auth/password-reset") {
      resetPayload = request.postDataJSON();
      const { status, message, errors } = resetResponse;
      return route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({
          success: status < 400,
          message: message ?? "Password has been reset; sign in again",
          data: null,
          ...(errors ? { errors } : {})
        })
      });
    }
    return respond(route, 200, { items: [] });
  });
  return () => resetPayload;
}

test("reset page submits the URL token unchanged and redirects to login", async ({ page }) => {
  const readPayload = await configureGuestApi(page);
  await page.goto(`/reset-password?token=${encodeURIComponent(syntheticToken)}`);

  await expect(page.getByLabel("Reset token")).toHaveValue(syntheticToken);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Reset password" }).click();

  await expect(page).toHaveURL("/login");
  expect(readPayload()).toEqual({ token: syntheticToken, password: newPassword });
});

test("a rejected reset token shows the scoped recovery message", async ({ page }) => {
  await configureGuestApi(page, {
    status: 400,
    message: "The account action token is invalid or expired"
  });
  await page.goto(`/reset-password?token=${encodeURIComponent(syntheticToken)}`);

  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Reset password" }).click();

  await expect(page.getByRole("alert")).toContainText(
    "This reset link is invalid, expired, or has already been used"
  );
});

test("password validation failures are not reported as invalid reset links", async ({ page }) => {
  await configureGuestApi(page, {
    status: 400,
    message: "Request validation failed",
    errors: [{ path: ["password"], message: "Password must not exceed 72 UTF-8 bytes" }]
  });
  await page.goto(`/reset-password?token=${encodeURIComponent(syntheticToken)}`);

  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Reset password" }).click();

  await expect(page.getByRole("alert")).toContainText("Choose a password that meets the requirements");
  await expect(page.getByRole("alert")).not.toContainText("This reset link is invalid");
});
