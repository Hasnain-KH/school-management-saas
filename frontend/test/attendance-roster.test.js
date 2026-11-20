import assert from "node:assert/strict";
import test from "node:test";
import { buildStudentAttendancePayload, lateStudentsMissingCheckIn, normalizeAttendanceRoster } from "../src/utils/attendance-roster.js";

test("normalizes nested attendance items while preserving student ids and recorded status", () => {
  const rows = normalizeAttendanceRoster([
    {
      student: { id: "student-1", firstName: "Ada", lastName: "Lovelace", admissionNumber: "A001" },
      attendance: { id: "attendance-1", status: "late" }
    },
    {
      student: { _id: "student-2", firstName: "Grace", lastName: "Hopper" },
      attendance: null
    }
  ]);

  assert.deepEqual(rows.map(({ id, studentId, status }) => ({ id, studentId, status })), [
    { id: "student-1", studentId: "student-1", status: "late" },
    { id: "student-2", studentId: "student-2", status: "present" }
  ]);
  assert.equal(rows[0].firstName, "Ada");
});

test("continues to accept the previous flat roster shape", () => {
  assert.deepEqual(normalizeAttendanceRoster([{ id: "student-3", firstName: "Katherine", status: "absent" }]), [
    { id: "student-3", firstName: "Katherine", status: "absent", studentId: "student-3" }
  ]);
});

test("preserves a recorded check-in time so a late mark can be edited", () => {
  const rows = normalizeAttendanceRoster([
    { student: { id: "student-4", firstName: "Mary" }, attendance: { status: "late", checkIn: "09:15" } }
  ]);
  assert.equal(rows[0].checkIn, "09:15");
});

test("late records include the check-in time and present records omit it when blank", () => {
  const payload = buildStudentAttendancePayload({
    date: "2026-02-10",
    sectionId: "section-1",
    roster: [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
    status: { s1: "late", s2: "present", s3: "absent" },
    checkIn: { s1: "09:20", s2: "", s3: "" }
  });

  assert.deepEqual(payload, {
    date: "2026-02-10",
    sectionId: "section-1",
    records: [
      { studentId: "s1", status: "late", checkIn: "09:20" },
      { studentId: "s2", status: "present" },
      { studentId: "s3", status: "absent" }
    ]
  });
});

test("absent and leave records never carry a check-in time", () => {
  const payload = buildStudentAttendancePayload({
    date: "2026-02-10",
    sectionId: "section-1",
    roster: [{ id: "s1" }],
    status: { s1: "leave" },
    checkIn: { s1: "09:20" }
  });
  assert.equal("checkIn" in payload.records[0], false);
});

test("flags students marked late without a check-in time", () => {
  const roster = [{ id: "s1" }, { id: "s2" }];
  const status = { s1: "late", s2: "late" };
  const missing = lateStudentsMissingCheckIn(roster, status, { s1: "09:20" });
  assert.deepEqual(missing.map((student) => student.id), ["s2"]);
});
