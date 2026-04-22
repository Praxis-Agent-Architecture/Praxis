import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  planWindowScreenshot,
  windowScreenshotDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.windowScreenshot.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.windowScreenshot.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.windowScreenshot.md",
  testFileUrl: import.meta.url,
});

test("planWindowScreenshot creates a guarded dry-run capture plan", () => {
  const result = planWindowScreenshot({
    runtimeId: "runtime-1",
    target: { windowRef: "window:active", titleHint: "Browser" },
    purpose: "inspect visible UI state",
    outputFormat: "image/png",
    permission: { accepted: true },
    requestedScopes: ["tool:computeruse:screenshot"],
    allowedScopes: ["tool:computeruse:screenshot"],
  });

  assert.equal(windowScreenshotDescriptor.defaultDispatch, "dry-run");
  assert.equal(windowScreenshotDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected window screenshot dry-run plan");
  }

  assert.equal(result.plan.toolKind, "computeruse.windowScreenshot");
  assert.equal(result.plan.target.windowRef, "window:active");
  assert.equal(result.plan.includeWindowFrame, true);
  assert.equal(result.plan.screenshotCaptured, false);
  assert.equal(result.plan.dispatch, "dry-run");
  assert.deepEqual(result.plan.permissions, ["screen:read:dry-run", "window:inspect:dry-run"]);
});

test("planWindowScreenshot rejects missing target, denied scope, and real capture", () => {
  const missingTarget = planWindowScreenshot({
    runtimeId: "runtime-1",
    purpose: "inspect visible UI state",
    permission: { accepted: true },
  });

  assert.equal(missingTarget.ok, false);
  if (!missingTarget.ok) {
    assert.equal(missingTarget.error.code, "MISSING_WINDOW_REF");
    assert.equal(missingTarget.error.boundary, "input");
  }

  const denied = planWindowScreenshot({
    runtimeId: "runtime-1",
    target: { windowRef: "window:active" },
    purpose: "inspect visible UI state",
    permission: { accepted: true },
    requestedScopes: ["tool:computeruse:screenshot"],
    allowedScopes: ["tool:computeruse:keyboard"],
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }

  const realCapture = planWindowScreenshot({
    runtimeId: "runtime-1",
    target: { windowRef: "window:active" },
    purpose: "inspect visible UI state",
    permission: { accepted: true },
    dryRun: false,
  });

  assert.equal(realCapture.ok, false);
  if (!realCapture.ok) {
    assert.equal(realCapture.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realCapture.error.boundary, "governance");
  }
});
