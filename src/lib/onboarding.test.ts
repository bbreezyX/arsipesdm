import assert from "node:assert/strict";
import { test } from "node:test";
import { canUseOnboarding, onboardingIds, onboardingKey, onboardingUpdate, parseOnboardingProgress } from "./onboarding";

test("reader guidance cannot include write-only features", () => {
  assert.deepEqual(onboardingIds.filter(id => canUseOnboarding({ role: "viewer" }, id)), ["archive-guide"]);
  for (const role of ["operator", "admin"] as const)
    assert.ok(onboardingIds.every(id => canUseOnboarding({ role }, id)));
});

test("preferences stay isolated by account and guide", () => {
  assert.notEqual(onboardingKey("one", "archive-guide"), onboardingKey("two", "archive-guide"));
  assert.notEqual(onboardingKey("one", "archive-guide"), onboardingKey("one", "documents"));
  assert.equal(onboardingUpdate.safeParse({ id: "archive-guide", status: "completed", userId: "another-account" }).success, false);
  assert.equal(onboardingUpdate.safeParse({ id: "anything", status: "completed" }).success, false);
});

test("unavailable or old browser preferences do not break onboarding", () => {
  for (const value of [null, false, "bad data", []]) assert.deepEqual(parseOnboardingProgress(value), {});
  assert.deepEqual(parseOnboardingProgress({ "archive-guide": "completed", documents: "dismissed", "import-excel": true, unknown: "completed" }), {
    "archive-guide": "completed", documents: "dismissed",
  });
});
