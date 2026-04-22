import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  fullscreenScreenshotDescriptor,
  planFullscreenScreenshot,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.fullscreenScreenshot.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.fullscreenScreenshot.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.fullscreenScreenshot.md",
  testFileUrl: import.meta.url,
});

test("planFullscreenScreenshot creates a guarded dry-run capture plan", () => {
  const result = planFullscreenScreenshot({
    context: {
      runtimeId: "runtime-1",
      invocationId: "fullscreen-1",
      permission: { accepted: true },
      requestedScopes: ["tool:computeruse:screen"],
      allowedScopes: ["tool:computeruse:screen"],
    },
    displayId: "display-1",
    purpose: "debug visual state",
    outputFormat: "image/jpeg",
  });

  assert.equal(result.ok, true);
  assert.equal(fullscreenScreenshotDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "computeruse.fullscreenScreenshot");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.displayId, "display-1");
  assert.equal(result.plan.outputFormat, "image/jpeg");
  assert.equal(result.plan.wouldCaptureScreen, true);
  assert.equal(result.plan.screenshotCaptured, false);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(result.plan.acceptedScopes, ["tool:computeruse:screen"]);
  assert.equal(result.plan.audit.privacyReviewRequired, true);
});

test("planFullscreenScreenshot classifies missing context, permission, and side-effect errors", () => {
  const missing = planFullscreenScreenshot();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const withoutPermission = planFullscreenScreenshot({
    context: { runtimeId: "runtime-1" },
    purpose: "debug visual state",
  });
  assert.equal(withoutPermission.ok, false);
  if (!withoutPermission.ok) {
    assert.equal(withoutPermission.error.code, "PERMISSION_REQUIRED");
    assert.equal(withoutPermission.error.boundary, "permission");
  }

  const realSideEffect = planFullscreenScreenshot({
    context: { runtimeId: "runtime-1", dryRun: false, permission: { accepted: true } },
    purpose: "debug visual state",
  });
  assert.equal(realSideEffect.ok, false);
  if (!realSideEffect.ok) {
    assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realSideEffect.error.boundary, "governance");
  }
});
