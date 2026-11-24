import { expect, test } from "@playwright/test";

const api = "http://localhost:5000/api/v1";
const platformIdentity = { role: "platform_super_admin", name: "Platform Admin", school: null };
const schoolIdentity = {
  role: "school_admin",
  name: "School Admin",
  school: { name: "Test School", status: "active", subscription: { plan: "test" } }
};

const respond = (route, status, data, message = "Request completed") =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ success: status < 400, message, data }) });

async function mockSession(page, identity) {
  await page.addInitScript(() => {
    window.__copiedValues = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => { window.__copiedValues.push(text); } }
    });
  });
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    if (path === "/auth/csrf") return respond(route, 200, { csrfToken: "test-csrf-token" });
    if (path === "/auth/me") return respond(route, 200, { user: { id: "test-user", ...identity }, school: identity.school });
    if (path === "/auth/refresh") return respond(route, 401, null, "Session expired");
    if (path === "/reports/dashboard") return respond(route, 200, {});
    return respond(route, 200, { items: [] });
  });
}

async function mockReceivingAccountsApi(page, accounts) {
  const requests = [];
  await page.route(`${api}/platform/receiving-accounts**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const accountId = url.pathname.match(/\/receiving-accounts\/([^/]+)/)?.[1];
    requests.push({ method, path: url.pathname.replace("/api/v1", ""), search: url.search, body: request.postDataJSON?.() || null });

    if (method === "GET") return respond(route, 200, { items: accounts.slice(), pagination: { page: 1, limit: 25, total: accounts.length, pages: 1 } });
    if (method === "POST") {
      const account = { id: "account-1", ...request.postDataJSON(), isActive: request.postDataJSON()?.isActive ?? true };
      accounts.push(account);
      return respond(route, 201, { account }, "Receiving account created");
    }
    if (method === "PATCH" && url.pathname.endsWith("/status")) {
      const account = accounts.find((entry) => entry.id === accountId);
      if (account) account.isActive = request.postDataJSON()?.isActive;
      return respond(route, 200, { account }, "Status updated");
    }
    if (method === "PATCH") {
      const account = accounts.find((entry) => entry.id === accountId);
      Object.assign(account || {}, request.postDataJSON() || {});
      return respond(route, 200, { account }, "Receiving account updated");
    }
    if (method === "DELETE") {
      const index = accounts.findIndex((entry) => entry.id === accountId);
      if (index >= 0) accounts.splice(index, 1);
      return respond(route, 200, { id: accountId }, "Receiving account deleted");
    }
    return respond(route, 405, null, "Method not allowed");
  });
  return requests;
}

test("super admin can add, edit, deactivate and delete a receiving account", async ({ page }) => {
  const accounts = [];
  await mockSession(page, platformIdentity);
  const requests = await mockReceivingAccountsApi(page, accounts);
  await page.goto("/platform/revenue");
  await page.getByRole("button", { name: "Receiving accounts" }).click();
  await expect(page.getByText("No receiving accounts")).toBeVisible();

  await page.getByRole("button", { name: "Add account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Account type").selectOption("bank_account");
  await dialog.getByLabel("Bank / provider name").fill("Example Bank");
  await dialog.getByLabel("Account title").fill("SchoolFlow Platform");
  await dialog.getByLabel("Account number").fill("1234 5678 9012");
  await dialog.getByLabel("IBAN (optional)").fill("PK36SCBL0000001123456702");
  await dialog.getByRole("button", { name: "Add account" }).click();

  await expect(page.getByRole("cell", { name: "Example Bank", exact: true })).toBeVisible();
  expect(requests.some((entry) => entry.method === "POST" && entry.body?.accountNumber === "1234 5678 9012")).toBe(true);

  await page.getByRole("button", { name: "Edit Example Bank" }).click();
  const editDialog = page.getByRole("dialog");
  await editDialog.getByLabel("Bank / provider name").fill("Example Bank Updated");
  await editDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("cell", { name: "Example Bank Updated", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Deactivate Example Bank Updated" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByRole("cell", { name: "Inactive" })).toBeVisible();
  expect(requests.some((entry) => entry.method === "PATCH" && entry.path.endsWith("/status") && entry.body?.isActive === false)).toBe(true);

  await page.getByRole("button", { name: "Delete Example Bank Updated" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByText("No receiving accounts")).toBeVisible();
  expect(requests.some((entry) => entry.method === "DELETE" && entry.search.includes("confirm=true"))).toBe(true);
});

test("school owner sees only active receiving details and can copy references", async ({ page }) => {
  await mockSession(page, schoolIdentity);
  await page.route(`${api}/schools/receiving-accounts`, (route) => respond(route, 200, {
    accounts: [{
      id: "account-1",
      accountType: "bank_account",
      providerName: "Example Bank",
      accountTitle: "SchoolFlow Platform",
      accountNumber: "1234 5678 9012",
      iban: "PK36SCBL0000001123456702",
      mobileWalletNumber: null,
      instructions: "Use your school name as the reference."
    }]
  }));

  const mutations = [];
  page.on("request", (request) => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) mutations.push(request.url());
  });

  await page.goto("/billing");
  await expect(page.getByText("Where to send a manual payment")).toBeVisible();
  await expect(page.getByText("The Super Admin verifies the payment independently.")).toBeVisible();
  await expect(page.getByText("Use your school name as the reference.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy Account number for Example Bank" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy IBAN for Example Bank" })).toBeVisible();

  await page.getByRole("button", { name: "Copy Account number for Example Bank" }).click();
  await expect(page.getByText("Account number copied.")).toBeVisible();
  expect(await page.evaluate(() => window.__copiedValues)).toContain("1234 5678 9012");

  await expect(page.getByRole("button", { name: /Edit|Delete|Deactivate/ })).toHaveCount(0);
  expect(mutations).toEqual([]);
});
