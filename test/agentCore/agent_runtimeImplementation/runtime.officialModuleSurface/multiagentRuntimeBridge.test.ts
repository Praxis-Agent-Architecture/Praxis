import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createMultiagentRuntimeBridge } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/multiagentRuntimeBridge.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/multiagentRuntimeBridge.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/multiagentRuntimeBridge.md",
  testFileUrl: import.meta.url,
});

test("createMultiagentRuntimeBridge exposes dry-run spawn, resume, interrupt, and coordination access", () => {
  const result = createMultiagentRuntimeBridge({
    runtimeId: "runtime-1",
    moduleId: "multiagent-main",
    parentAgentId: "agent-parent",
    childAgentId: "agent-child",
    coordinationId: "coordination-1",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.moduleKind, "multiagent");
  assert.equal(result.plan.spawnAccess, "dry-run");
  assert.equal(result.plan.resumeAccess, "dry-run");
  assert.equal(result.plan.interruptAccess, "dry-run");
  assert.equal(result.plan.coordinationAccess, "runtime-mediated");
  assert.equal(result.plan.runtimeReuseAccess, "runtime-mediated");
  assert.equal(result.plan.multiagentStrategyImplemented, false);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(
    result.plan.capabilityContract.grantedCapabilities.map((capability) => capability.capabilityId),
    [
      "runtime.agent.spawn",
      "runtime.agent.resume",
      "runtime.agent.interrupt",
      "runtime.agent.coordination",
      "runtime.surface.reuse",
    ],
  );
});

test("createMultiagentRuntimeBridge rejects governance failures and spawn capability overreach", () => {
  const governanceRejected = createMultiagentRuntimeBridge({
    runtimeId: "runtime-1",
    moduleId: "multiagent-main",
    governance: { accepted: false, reason: "multiagent module is disabled" },
  });

  assert.equal(governanceRejected.ok, false);
  assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governanceRejected.error.boundary, "governance");
  assert.equal(governanceRejected.error.message, "multiagent module is disabled");

  const overreach = createMultiagentRuntimeBridge({
    runtimeId: "runtime-1",
    moduleId: "multiagent-main",
    allowedCapabilities: [{ capabilityId: "runtime.agent.coordination", channels: ["read"] }],
  });

  assert.equal(overreach.ok, false);
  assert.equal(overreach.error.code, "CAPABILITY_NOT_GRANTED");
  assert.equal(overreach.error.boundary, "scope");
});
