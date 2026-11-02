import assert from "node:assert/strict";
import test from "node:test";
import { buildExamPayload } from "../src/utils/exam-payload.js";

const validInput = () => ({
  academicSessionId: "session-id",
  classId: "class-id",
  name: "Term 1",
  gradingScale: [
    { minPercent: "0", maxPercent: "60", grade: "Needs support", remark: "" },
    { minPercent: "60", maxPercent: "100", grade: "Meets standard", remark: "Promoted" }
  ],
  subjects: [{
    classSubjectId: "subject-id",
    examDate: "2026-11-10",
    startTime: "09:00",
    durationMinutes: "60",
    maxMarks: "100",
    passingMarks: "40"
  }]
});

test("exam payload preserves school-defined grading policy and converts schedule numbers", () => {
  const payload = buildExamPayload(validInput());
  assert.deepEqual(payload, {
    academicSessionId: "session-id",
    classId: "class-id",
    name: "Term 1",
    gradingScale: [
      { minPercent: 0, maxPercent: 60, grade: "Needs support" },
      { minPercent: 60, maxPercent: 100, grade: "Meets standard", remark: "Promoted" }
    ],
    subjects: [{
      classSubjectId: "subject-id",
      examDate: "2026-11-10",
      startTime: "09:00",
      durationMinutes: 60,
      maxMarks: 100,
      passingMarks: 40
    }]
  });
  assert.equal("schoolId" in payload, false);
  assert.equal("role" in payload, false);
});

test("exam payload rejects incomplete grading bands and overlapping schedules", () => {
  const brokenScale = validInput();
  brokenScale.gradingScale[1].minPercent = "61";
  assert.throws(() => buildExamPayload(brokenScale), /continuously cover/);

  const overlapping = validInput();
  overlapping.subjects.push({
    classSubjectId: "other-subject",
    examDate: "2026-11-10",
    startTime: "09:30",
    durationMinutes: "30",
    maxMarks: "50",
    passingMarks: "20"
  });
  assert.throws(() => buildExamPayload(overlapping), /must not overlap/);
});
