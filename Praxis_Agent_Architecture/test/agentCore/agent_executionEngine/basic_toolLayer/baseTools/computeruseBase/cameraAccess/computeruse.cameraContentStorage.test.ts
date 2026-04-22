import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  cameraContentStorageDescriptor,
  planCameraContentStorage,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraContentStorage.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraContentStorage.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraContentStorage.md",
  testFileUrl: import.meta.url,
});

test("planCameraContentStorage creates a privacy guarded dry-run storage envelope", () => {
  const result = planCameraContentStorage({
    runtimeId: "runtime-1",
    contentRef: "capture:front-camera:001",
    storageTarget: "session://camera/capture-001",
    retentionPolicy: "session-only",
    purpose: "debug artifact handoff",
    permission: { accepted: true },
    requestedScopes: ["tool:computeruse.camera"],
    allowedScopes: ["tool:computeruse.camera"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(cameraContentStorageDescriptor.unsafeSideEffects, false);
  assert.equal(result.plan.toolKind, "computeruse.cameraContentStorage");
  assert.equal(result.plan.contentRef, "capture:front-camera:001");
  assert.equal(result.plan.storageTarget, "session://camera/capture-001");
  assert.deepEqual(result.plan.permissions, ["camera:read:dry-run", "storage:write:dry-run"]);
  assert.equal(result.plan.execution.dryRun, true);
  assert.equal(result.plan.execution.contentStored, false);
  assert.equal(result.plan.audit.privacyReviewRequired, true);
  assert.deepEqual(result.events, ["basicTool.computeruse.cameraContentStorage.planned"]);
});

test("planCameraContentStorage rejects missing runtime context", () => {
  const result = planCameraContentStorage();

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("empty input must be rejected");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("planCameraContentStorage rejects real storage in the first round", () => {
  const result = planCameraContentStorage({
    runtimeId: "runtime-1",
    contentRef: "capture:front-camera:001",
    storageTarget: "session://camera/capture-001",
    purpose: "debug artifact handoff",
    permission: { accepted: true },
    dryRun: false,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("real camera content storage must be rejected");
  }

  assert.equal(result.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(result.error.boundary, "governance");
  assert.deepEqual(result.events, ["basicTool.computeruse.cameraContentStorage.rejected"]);
});
