import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createTapRuntimeBridge } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/tapRuntimeBridge.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/tapRuntimeBridge.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/tapRuntimeBridge.md",
  testFileUrl: import.meta.url,
});

test("createTapRuntimeBridge plans TAP tool, approval, governance, and execution channels", () => {
  const result = createTapRuntimeBridge({
    runtimeId: "runtime-1",
    tapModuleId: "tap",
    toolAction: "tool.shell.run",
    toolName: "shell",
    allowedModuleScopes: ["tool.invoke", "tool.approve"],
    requestedScopes: ["tool.invoke"],
    rules: [
      {
        id: "shell-needs-approval",
        decision: "requires-approval",
        reason: "shell tools require TAP approval",
        match: { actions: ["tool.shell.run"], callerKinds: ["official-module"] },
      },
    ],
    channelAvailability: {
      tool: true,
      approval: true,
      execution: true,
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.tapModuleId, "tap");
  assert.equal(result.plan.moduleKind, "TAP");
  assert.equal(result.plan.toolAction, "tool.shell.run");
  assert.equal(result.plan.approvalRequired, true);
  assert.equal(result.plan.outcome, "awaiting-approval");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.mockableEnvelope, true);
  assert.equal(result.plan.tapStrategyImplemented, false);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(
    result.plan.channelPlan.map((channel) => channel.channel),
    ["tool", "approval", "execution"],
  );
});

test("createTapRuntimeBridge rejects invalid requests, governance denial, and unavailable channels", () => {
  const missingAction = createTapRuntimeBridge({
    runtimeId: "runtime-1",
    tapModuleId: "tap",
  });

  assert.equal(missingAction.ok, false);
  assert.equal(missingAction.error.code, "MISSING_TOOL_ACTION");
  assert.equal(missingAction.error.boundary, "input");

  const denied = createTapRuntimeBridge({
    runtimeId: "runtime-1",
    tapModuleId: "tap",
    toolAction: "tool.git.write",
    allowedModuleScopes: ["tool.read"],
    requestedScopes: ["tool.write"],
  });

  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "GOVERNANCE_DENIED");
  assert.equal(denied.error.boundary, "governance");

  const unavailable = createTapRuntimeBridge({
    runtimeId: "runtime-1",
    tapModuleId: "tap",
    toolAction: "tool.search",
    allowedModuleScopes: ["tool.invoke"],
    requestedScopes: ["tool.invoke"],
    channelAvailability: { execution: false },
  });

  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.error.code, "CHANNEL_UNAVAILABLE");
  assert.equal(unavailable.error.publicSafe, true);
});
