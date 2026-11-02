import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAttendanceRoster } from "../src/utils/attendance-roster.js";

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
