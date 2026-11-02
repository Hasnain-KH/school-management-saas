import assert from "node:assert/strict";
import test from "node:test";
import { buildAcademicSetupPayload } from "../src/utils/academic-setup.js";

test("academic setup requests match session and section contracts without tenant fields", () => {
  assert.deepEqual(buildAcademicSetupPayload("sessions", {
    name: "2026-27", startDate: "2026-09-01", endDate: "2027-06-30"
  }), {
    endpoint: "/academics/sessions",
    body: { name: "2026-27", startDate: "2026-09-01", endDate: "2027-06-30" }
  });
  assert.deepEqual(buildAcademicSetupPayload("sections", {
    academicSessionId: "session-id", classId: "class-id", branchId: "branch-id", name: "A", capacity: "30"
  }), {
    endpoint: "/academics/sections",
    body: { academicSessionId: "session-id", classId: "class-id", branchId: "branch-id", name: "A", capacity: 30 }
  });
});

test("timetable payload converts numeric fields and omits blank optional room", () => {
  const request = buildAcademicSetupPayload("timetable", {
    academicSessionId: "session-id", sectionId: "section-id", classSubjectId: "class-subject-id",
    dayOfWeek: "1", periodNumber: "2", startsAt: "09:00", endsAt: "09:45", room: ""
  });
  assert.deepEqual(request, {
    endpoint: "/academics/timetable",
    body: {
      academicSessionId: "session-id", sectionId: "section-id", classSubjectId: "class-subject-id",
      dayOfWeek: 1, periodNumber: 2, startsAt: "09:00", endsAt: "09:45"
    }
  });
  assert.equal("schoolId" in request.body, false);
  assert.equal("role" in request.body, false);
});
