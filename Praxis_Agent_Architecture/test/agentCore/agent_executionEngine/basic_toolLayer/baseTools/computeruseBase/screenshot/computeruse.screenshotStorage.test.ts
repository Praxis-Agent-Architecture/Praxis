import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  planScreenshotStorage,
  screenshotStorageDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.screenshotStorage.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.screenshotStorage.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.screenshotStorage.md",
  testFileUrl: import.meta.url,
});

test("planScreenshotStorage creates a privacy guarded dry-run storage plan", () => {
  const result = planScreenshotStorage({
    runtimeId: "runtime-1",
    screenshotRef: "screen:capture-001",
    storageTarget: "session://screenshots/capture-001.png",
    retentionPolicy: "session-only",
    purpose: "handoff visual evidence",
    permission: { accepted: true },
    requestedScopes: ["tool:computeruse:screenshot"],
    allowedScopes: ["tool:computeruse:screenshot"],
  });

  assert.equal(screenshotStorageDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected screenshot storage dry-run plan");
  }

  assert.equal(result.plan.toolKind, "computeruse.screenshotStorage");
  assert.equal(result.plan.screenshotRef, "screen:capture-001");
  assert.equal(result.plan.storageTarget, "session://screenshots/capture-001.png");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.screenshotStored, false);
  assert.deepEqual(result.plan.permissions, ["screen:read:dry-run", "storage:write:dry-run"]);
});

test("planScreenshotStorage classifies permission and real side-effect errors", () => {
  const missingPermission = planScreenshotStorage({
    runtimeId: "runtime-1",
    screenshotRef: "screen:capture-001",
    storageTarget: "session://screenshots/capture-001.png",
    purpose: "handoff visual evidence",
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_REQUIRED");
    assert.equal(missingPermission.error.boundary, "permission");
  }

  const realStorage = planScreenshotStorage({
    runtimeId: "runtime-1",
    screenshotRef: "screen:capture-001",
    storageTarget: "session://screenshots/capture-001.png",
    purpose: "handoff visual evidence",
    permission: { accepted: true },
    dryRun: false,
  });

  assert.equal(realStorage.ok, false);
  if (!realStorage.ok) {
    assert.equal(realStorage.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realStorage.error.boundary, "governance");
  }
});
