import assert from "node:assert/strict";
import test from "node:test";

const { default: StudentMedia } = await import("../src/models/student-media.model.js");
const { getStudentMediaUsageSummary } = await import("../src/services/student-media.service.js");

test("student media usage summary reports an unconfigured storage provider honestly", async (t) => {
  t.mock.method(StudentMedia, "aggregate", async (pipeline) => {
    return pipeline.some((stage) => stage.$group?._id === "$mediaType") ? [] : [{ count: 0, totalBytes: 0 }];
  });
  t.mock.method(StudentMedia, "countDocuments", async () => 0);

  const summary = await getStudentMediaUsageSummary({
    user: { _id: "64a000000000000000000011", schoolId: "64a000000000000000000001", role: "school_admin" },
    school: { _id: "64a000000000000000000001" }
  });

  assert.equal(summary.provider.configured, false);
  assert.equal(summary.provider.verifiedUsageAvailable, false);
});
