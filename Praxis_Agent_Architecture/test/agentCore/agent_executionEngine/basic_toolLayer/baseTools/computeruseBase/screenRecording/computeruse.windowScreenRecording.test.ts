import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  planWindowScreenRecording,
  windowScreenRecordingDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.windowScreenRecording.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.windowScreenRecording.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.windowScreenRecording.md",
  testFileUrl: import.meta.url,
});

test("planWindowScreenRecording creates a guarded dry-run recording plan", () => {
  const result = planWindowScreenRecording({
    context: {
      runtimeId: "runtime-1",
      invocationId: "window-rec-1",
      permission: { accepted: true },
      requestedScopes: ["tool:computeruse:screen"],
      allowedScopes: ["tool:computeruse:screen"],
    },
    target: { windowId: "win-42", titleHint: "Terminal" },
    purpose: "record a reproducible UI issue",
    destinationHint: "captures/window.webm",
    maxDurationMs: 30_000,
    frameRate: 24,
    includeCursor: true,
  });

  assert.equal(result.ok, true);
  assert.equal(windowScreenRecordingDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "computeruse.windowScreenRecording");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.target.windowId, "win-42");
  assert.equal(result.plan.maxDurationMs, 30_000);
  assert.equal(result.plan.frameRate, 24);
  assert.equal(result.plan.wouldStartRecording, true);
  assert.equal(result.plan.recordingStarted, false);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.equal(result.plan.requiredPermissions.includes("filesystem:write"), true);
  assert.deepEqual(result.plan.acceptedScopes, ["tool:computeruse:screen"]);
});

test("planWindowScreenRecording classifies target, permission, and resource errors", () => {
  const missingTarget = planWindowScreenRecording({
    context: { runtimeId: "runtime-1", permission: { accepted: true } },
    purpose: "record a reproducible UI issue",
  });
  assert.equal(missingTarget.ok, false);
  if (!missingTarget.ok) {
    assert.equal(missingTarget.error.code, "MISSING_WINDOW_TARGET");
    assert.equal(missingTarget.error.boundary, "input");
  }

  const withoutPermission = planWindowScreenRecording({
    context: { runtimeId: "runtime-1" },
    target: { titleHint: "Terminal" },
    purpose: "record a reproducible UI issue",
  });
  assert.equal(withoutPermission.ok, false);
  if (!withoutPermission.ok) {
    assert.equal(withoutPermission.error.code, "PERMISSION_REQUIRED");
    assert.equal(withoutPermission.error.boundary, "permission");
  }

  const badFrameRate = planWindowScreenRecording({
    context: { runtimeId: "runtime-1", permission: { accepted: true } },
    target: { titleHint: "Terminal" },
    purpose: "record a reproducible UI issue",
    frameRate: 120,
  });
  assert.equal(badFrameRate.ok, false);
  if (!badFrameRate.ok) {
    assert.equal(badFrameRate.error.code, "INVALID_FRAME_RATE");
    assert.equal(badFrameRate.error.boundary, "resource");
  }
});

test("planWindowScreenRecording blocks non-dry-run recording", () => {
  const result = planWindowScreenRecording({
    context: { runtimeId: "runtime-1", dryRun: false, permission: { accepted: true } },
    target: { titleHint: "Terminal" },
    purpose: "record a reproducible UI issue",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(result.error.boundary, "governance");
  }
});
