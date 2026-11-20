import { expect, test } from "@playwright/test";

const api = "http://localhost:5000/api/v1";

const respond = (route, status, data, message = "Request completed") =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ success: status < 400, message, data }) });

// Mock the tenant API used by the academic-setup page and capture POST bodies.
async function configureAcademicApi(page, captured) {
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

    if (path === "/academics/sessions") return respond(route, 200, { items: [{ _id: "session-1", name: "2025-26", status: "active" }] });
    if (path === "/academics/classes") return respond(route, 200, { items: [{ _id: "class-1", name: "Grade 5", code: "G5", isActive: true }] });
    if (path === "/academics/branches") return respond(route, 200, { items: [{ _id: "branch-1", name: "Main", code: "MN" }] });
    if (path === "/academics/sections") {
      return respond(route, 200, { items: [{ _id: "section-1", name: "A", classId: "class-1", academicSessionId: "session-1", branchId: "branch-1", isActive: true }] });
    }
    if (path === "/academics/subjects") return respond(route, 200, { items: [{ _id: "subject-1", name: "Mathematics", code: "MTH", isActive: true }] });
    if (path === "/academics/class-subjects" && request.method() === "GET") {
      return respond(route, 200, {
        items: [{ _id: "class-subject-1", classId: "class-1", subjectId: "subject-1", academicSessionId: "session-1", teacherId: "teacher-1", periodsPerWeek: 5, isActive: true }]
      });
    }
    if (path === "/academics/class-subjects" && request.method() === "POST") return respond(route, 201, { _id: "class-subject-2" });
    if (path === "/academics/timetable" && request.method() === "GET") return respond(route, 200, { items: [] });
    if (path === "/academics/timetable" && request.method() === "POST") return respond(route, 201, { _id: "timetable-1" });
    if (path === "/users") return respond(route, 200, { items: [{ id: "teacher-1", name: "Teacher One", email: "teacher@example.test", role: "teacher", status: "active" }] });
    return respond(route, 200, { items: [] });
  });
}

async function signInAsSchoolAdmin(page, captured) {
  await configureAcademicApi(page, captured);
  await page.goto("/login");
  await page.getByLabel("School workspace").fill("test-school");
  await page.getByLabel("Email address").fill("admin@example.test");
  await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/academics");
}

// Regression guard for the academic-setup dialogs: the timetable form must open,
// build the documented payload, and submit through the existing API endpoint.
test("timetable form generates the correct payload and posts to /academics/timetable", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const captured = [];
  await signInAsSchoolAdmin(page, captured);

  await page.getByRole("tab", { name: "Timetable" }).click();
  await page.getByRole("button", { name: /Add timetable/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // The timetable dropdown is populated from class-subject assignments that have a teacher.
  await expect(dialog.getByLabel(/^Section/)).toContainText("Grade 5");
  await expect(dialog.getByLabel(/^Assigned subject/)).toContainText("Mathematics");

  await dialog.getByLabel(/^Section/).selectOption("section-1");
  await dialog.getByLabel(/^Assigned subject/).selectOption("class-subject-1");
  await dialog.getByLabel(/^Day/).fill("1");
  await dialog.getByLabel(/^Period number/).fill("2");
  await dialog.getByLabel(/^Starts at/).fill("09:00");
  await dialog.getByLabel(/^Ends at/).fill("09:45");
  await dialog.getByRole("button", { name: "Create record" }).click();

  await expect.poll(() => captured.find((entry) => entry.path === "/academics/timetable")).toBeTruthy();
  const posted = captured.find((entry) => entry.path === "/academics/timetable").body;
  expect(posted).toEqual({
    academicSessionId: "session-1",
    sectionId: "section-1",
    classSubjectId: "class-subject-1",
    dayOfWeek: 1,
    periodNumber: 2,
    startsAt: "09:00",
    endsAt: "09:45"
  });
  // Tenant and optional fields stay out of the payload exactly as before.
  expect(posted).not.toHaveProperty("schoolId");
  expect(posted).not.toHaveProperty("room");

  await expect(dialog).toBeHidden();
  expect(pageErrors).toEqual([]);
});

// The teacher selector must submit the existing teacher id (not the display name)
// so that the class subject still qualifies for the timetable dropdown.
test("class subject teacher selector submits the existing teacher id", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const captured = [];
  await signInAsSchoolAdmin(page, captured);

  await page.getByRole("tab", { name: "Class subjects" }).click();
  await page.getByRole("button", { name: /Add class subject/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/^Teacher/)).toContainText("Teacher One");

  await dialog.getByLabel(/^Class/).selectOption("class-1");
  await dialog.getByLabel(/^Subject/).selectOption("subject-1");
  await dialog.getByLabel(/^Teacher/).selectOption("teacher-1");
  await dialog.getByLabel(/^Periods per week/).fill("4");
  await dialog.getByRole("button", { name: "Create record" }).click();

  await expect.poll(() => captured.find((entry) => entry.path === "/academics/class-subjects")).toBeTruthy();
  const posted = captured.find((entry) => entry.path === "/academics/class-subjects").body;
  expect(posted).toEqual({
    academicSessionId: "session-1",
    classId: "class-1",
    subjectId: "subject-1",
    teacherId: "teacher-1",
    periodsPerWeek: 4
  });

  await expect(dialog).toBeHidden();
  expect(pageErrors).toEqual([]);
});
