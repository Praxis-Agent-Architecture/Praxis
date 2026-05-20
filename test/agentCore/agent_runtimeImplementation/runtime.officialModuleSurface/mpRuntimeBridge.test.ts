import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createMpRuntimeBridge } from "../../../../src/runtimeImplementation/runtime.officialModuleSurface/mpRuntimeBridge.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.officialModuleSurface/mpRuntimeBridge.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/mpRuntimeBridge.md",
  testFileUrl: import.meta.url,
});

test("createMpRuntimeBridge gives MP runtime-mediated memory, state, context, and invocation access", () => {
  const result = createMpRuntimeBridge({
    runtimeId: "runtime-1",
    moduleId: "mp-main",
    memorySpaceId: "memory-main",
    stateSnapshotId: "state-1",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.moduleKind, "MP");
  assert.equal(result.plan.memoryAccess, "runtime-mediated");
  assert.equal(result.plan.stateAccess, "runtime-mediated");
  assert.equal(result.plan.contextAccess, "runtime-mediated");
  assert.equal(result.plan.invocationAccess, "dry-run");
  assert.equal(result.plan.memoryStrategyImplemented, false);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(
    result.plan.capabilityContract.grantedCapabilities.map((capability) => capability.capabilityId),
    ["runtime.memory", "runtime.state", "runtime.context", "runtime.invocation"],
  );
});

test("createMpRuntimeBridge rejects missing module data and runtime readiness failures", () => {
  const missingModule = createMpRuntimeBridge({
    runtimeId: "runtime-1",
    moduleId: "",
  });

  assert.equal(missingModule.ok, false);
  assert.equal(missingModule.error.code, "MISSING_MODULE_ID");
  assert.equal(missingModule.error.boundary, "input");

  const notReady = createMpRuntimeBridge({
    runtimeId: "runtime-1",
    moduleId: "mp-main",
    runtimeReady: false,
  });

  assert.equal(notReady.ok, false);
  assert.equal(notReady.error.code, "RUNTIME_NOT_READY");
  assert.equal(notReady.error.boundary, "runtime-state");
});
