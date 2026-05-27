import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createMultiagentRuntimeBridge } from "../../../../src/runtimeImplementation/runtime.officialModuleSurface/multiagentRuntimeBridge.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.officialModuleSurface/multiagentRuntimeBridge.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/multiagentRuntimeBridge.md",
  testFileUrl: import.meta.url,
});

test("createMultiagentRuntimeBridge exposes runtime-mediated mesh access", () => {
  const result = createMultiagentRuntimeBridge({
    runtimeId: "runtime-1",
    moduleId: "multiagent-main",
    requesterSessionId: "session.requester",
    targetSessionId: "session.target",
    coordinationId: "coordination-1",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.moduleKind, "multiagent");
  assert.equal(result.plan.requesterSessionId, "session.requester");
  assert.equal(result.plan.targetSessionId, "session.target");
  assert.equal(result.plan.spawnAccess, "runtime-mediated");
  assert.equal(result.plan.messageAccess, "runtime-mediated");
  assert.equal(result.plan.inboxAccess, "runtime-mediated");
  assert.equal(result.plan.waitAccess, "runtime-mediated");
  assert.equal(result.plan.stopAccess, "runtime-mediated");
  assert.equal(result.plan.killAccess, "runtime-mediated");
  assert.equal(result.plan.listAccess, "runtime-mediated");
  assert.equal(result.plan.inspectAccess, "runtime-mediated");
  assert.equal(result.plan.coordinationAccess, "runtime-mediated");
  assert.equal(result.plan.runtimeReuseAccess, "runtime-mediated");
  assert.equal(result.plan.topology, "project-session-mesh");
  assert.equal(result.plan.multiagentStrategyImplemented, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(
    result.plan.capabilityContract.grantedCapabilities.map((capability) => capability.capabilityId),
    [
      "runtime.agent.spawn",
      "runtime.agent.message",
      "runtime.agent.inbox",
      "runtime.agent.wait",
      "runtime.agent.stop",
      "runtime.agent.kill",
      "runtime.agent.list",
      "runtime.agent.inspect",
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
