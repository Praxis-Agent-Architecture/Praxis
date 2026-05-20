import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createCmpRuntimeBridge } from "../../../../src/agentCore_runtimeImplementation/runtime.officialModuleSurface/cmpRuntimeBridge.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.officialModuleSurface/cmpRuntimeBridge.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/cmpRuntimeBridge.md",
  testFileUrl: import.meta.url,
});

test("createCmpRuntimeBridge gives CMP runtime-mediated context, task, invocation, and capability access", () => {
  const result = createCmpRuntimeBridge({
    runtimeId: "runtime-1",
    moduleId: "cmp-main",
    contextId: "ctx-1",
    taskId: "task-1",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.moduleKind, "CMP");
  assert.equal(result.plan.contextAccess, "runtime-mediated");
  assert.equal(result.plan.taskAccess, "runtime-mediated");
  assert.equal(result.plan.invocationAccess, "dry-run");
  assert.equal(result.plan.cmpStrategyImplemented, false);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(
    result.plan.capabilityContract.grantedCapabilities.map((capability) => capability.capabilityId),
    ["runtime.context", "runtime.task", "runtime.invocation", "runtime.capability"],
  );
});

test("createCmpRuntimeBridge rejects missing runtime data and capability overreach", () => {
  const missingRuntime = createCmpRuntimeBridge({
    moduleId: "cmp-main",
  });

  assert.equal(missingRuntime.ok, false);
  assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missingRuntime.error.boundary, "input");

  const overreach = createCmpRuntimeBridge({
    runtimeId: "runtime-1",
    moduleId: "cmp-main",
    requestedCapabilities: [{ capabilityId: "runtime.memory", channel: "invoke" }],
  });

  assert.equal(overreach.ok, false);
  assert.equal(overreach.error.code, "CAPABILITY_NOT_GRANTED");
  assert.equal(overreach.error.boundary, "scope");
});
