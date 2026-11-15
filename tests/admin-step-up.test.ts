import test from "node:test";
import assert from "node:assert/strict";
import {
  BA_STEP_UP_ACTIONS,
  BA_STEP_UP_ACTION_LABELS,
  isBaStepUpAction,
  stepUpAuditTarget,
} from "../lib/certificate/step-up-actions.ts";

test("BA step-up only covers high-risk certificate actions", () => {
  assert.deepEqual(Object.keys(BA_STEP_UP_ACTIONS), [
    "ba.certificates.issue",
    "ba.certificates.revoke",
    "ba.certificates.delete",
  ]);
  assert.equal(isBaStepUpAction("ba.certificates.issue"), true);
  assert.equal(isBaStepUpAction("ba.certificates.update"), false);
  assert.equal(isBaStepUpAction("ba.certificates.reject"), false);
});

test("BA step-up actions map to certificate permissions and labels", () => {
  assert.equal(BA_STEP_UP_ACTIONS["ba.certificates.issue"], "ba:certificates:issue");
  assert.equal(BA_STEP_UP_ACTIONS["ba.certificates.revoke"], "ba:certificates:revoke");
  assert.equal(BA_STEP_UP_ACTIONS["ba.certificates.delete"], "ba:certificates:delete");
  for (const action of Object.keys(BA_STEP_UP_ACTIONS) as Array<
    keyof typeof BA_STEP_UP_ACTIONS
  >) {
    assert.ok(BA_STEP_UP_ACTION_LABELS[action]);
  }
});

test("new certificate step-up audit target is not written as a UUID", () => {
  assert.deepEqual(stepUpAuditTarget("new"), {
    targetId: null,
    targetRef: "new",
  });
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
  assert.deepEqual(stepUpAuditTarget(id), {
    targetId: id,
    targetRef: id,
  });
});
