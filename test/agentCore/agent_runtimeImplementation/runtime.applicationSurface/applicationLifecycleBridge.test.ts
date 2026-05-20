import assert from "node:assert/strict";
import test from "node:test";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { planApplicationLifecycleBridge } from "../../../../src/runtimeImplementation/runtime.applicationSurface/applicationLifecycleBridge.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.applicationSurface/applicationLifecycleBridge.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.applicationSurface/applicationLifecycleBridge.md",
  testFileUrl: import.meta.url,
});

test("applicationLifecycleBridge plans application lifecycle signals without running side effects", () => {
  const result = planApplicationLifecycleBridge({
    runtimeId: " runtime:alpha ",
    applicationId: " app:writer ",
    applicationSignal: "reload",
    runtimeState: "ready",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.runtimeId, "runtime:alpha");
  assert.equal(result.plan.applicationId, "app:writer");
  assert.deepEqual(
    result.plan.runtimeTransitions.map((transition) => transition.command),
    ["shutdown", "boot"],
  );
  assert.equal(result.plan.lifecycleBoundaries.application, "external-application-lifecycle");
  assert.equal(result.plan.lifecycleBoundaries.runtime, "agentcore-runtime-lifecycle");
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.equal(result.plan.runtimeTransitions.every((transition) => transition.dryRun), true);
});

test("applicationLifecycleBridge returns classified errors for missing input and governance rejection", () => {
  const missing = planApplicationLifecycleBridge({
    runtimeId: "",
    applicationId: "app:writer",
    applicationSignal: "start",
  });

  assert.equal(missing.ok, false);
  if (missing.ok) {
    return;
  }

  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");

  const rejected = planApplicationLifecycleBridge({
    runtimeId: "runtime:alpha",
    applicationId: "app:writer",
    applicationSignal: "pause",
    runtimeState: "ready",
    governance: { accepted: false, reason: "pause not allowed" },
  });

  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    return;
  }

  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");
});
