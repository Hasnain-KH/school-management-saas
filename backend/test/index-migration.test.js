import assert from "node:assert/strict";
import test from "node:test";
import { models } from "../scripts/create-indexes.js";

test("production index migration includes every student media model", () => {
  const names = new Set(models.map((model) => model.modelName));
  for (const name of [
    "StudentMedia",
    "StudentMediaAccessLog",
    "StudentMediaCleanupTask",
    "StudentMediaConsent",
    "StudentMediaDailyUploadBucket",
    "StudentMediaQuota",
    "StudentMediaUploadReservation"
  ]) {
    assert.equal(names.has(name), true, `${name} must be included in create-indexes.js`);
  }
});
