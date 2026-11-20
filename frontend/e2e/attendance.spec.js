import { expect, test } from "@playwright/test";

const api = "http://localhost:5000/api/v1";

const respond = (route, status, data, message = "Request completed") =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ success: status < 400, message, data }) });

// Mock the tenant API used by the attendance workspace and capture POST bodies.
async function signInAndOpenAttendance(page, captured) {
  let authenticated = false;
  await page.route(`${api}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (request.method() === "POST") captured.push({ path, body: request.postDataJSON?.() ?? null });

    if (path === "/auth/csrf") return respond(route, 200, { csrfToken: "test-csrf-token" });
    if (path === "/auth/login") {
      authenticated = true;
      return respond(route, 200, { user: { id: "test-user", role: "school_admin", name: "School Admin", schoolId: "school-1" } });
    }
    if (path === "/auth/refresh" && !authenticated) return respond(route, 401, null, "Session expired");
    if (path === "/auth/me" && !authenticated) return respond(route, 401, null, "Authentication is required");
    if (path === "/auth/me") {
      return respond(route, 200, {
        user: { id: "test-user", role: "school_admin", name: "School Admin", schoolId: "school-1" },
        school: { name: "Test School", status: "active", subscription: { plan: "test" } }
      });
    }
    if (path === "/schools/me") return respond(route, 200, { school: { name: "Test School", status: "active", subscription: { plan: "test" } } });
    if (path === "/schools/subscription") return respond(route, 200, { plan: null });

    if (path === "/academics/sections") return respond(route, 200, { items: [{ _id: "section-1", className: "Grade 5", name: "A", isActive: true }] });
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

  await page.goto("/login");
  await page.getByLabel("School workspace").fill("test-school");
  await page.getByLabel("Email address").fill("admin@example.test");
  await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/attendance");
}

// Regression guard: a "late" mark must carry the check-in time the backend requires,
// otherwise the whole attendance sheet is rejected with HTTP 400.
test("attendance sends a check-in time for late students and omits it otherwise", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const captured = [];
  await signInAndOpenAttendance(page, captured);

  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(2);

  // Mark the first student late and provide a check-in time.
  await rows.nth(0).getByRole("combobox").selectOption("late");
  await rows.nth(0).getByLabel(/Check-in time/).fill("09:20");
  // The second student stays present (default) with no time.
  await page.getByRole("button", { name: "Save attendance" }).click();

  await expect.poll(() => captured.find((entry) => entry.path === "/attendance/students")).toBeTruthy();
  const posted = captured.find((entry) => entry.path === "/attendance/students").body;
  expect(posted.sectionId).toBe("section-1");
  expect(posted.records).toEqual([
    { studentId: "student-1", status: "late", checkIn: "09:20" },
    { studentId: "student-2", status: "present" }
  ]);
  expect(pageErrors).toEqual([]);
});

// The UI must block submission instead of sending a late record without a check-in time.
test("attendance blocks a late mark that has no check-in time", async ({ page }) => {
  const captured = [];
  await signInAndOpenAttendance(page, captured);

  const rows = page.locator("tbody tr");
  await rows.nth(0).getByRole("combobox").selectOption("late");
  await page.getByRole("button", { name: "Save attendance" }).click();

  await expect(page.getByRole("alert")).toContainText("check-in time");
  expect(captured.find((entry) => entry.path === "/attendance/students")).toBeFalsy();
});
