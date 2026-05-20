import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createModuleGovernanceBridge } from "../../../../src/runtimeImplementation/runtime.governancePlane/moduleGovernanceBridge.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.governancePlane/moduleGovernanceBridge.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.governancePlane/moduleGovernanceBridge.md",
  testFileUrl: import.meta.url,
});

test("createModuleGovernanceBridge lets official modules request and read governance decisions", () => {
  const result = createModuleGovernanceBridge({
    runtimeId: "runtime-1",
    moduleId: "tap",
    moduleKind: "TAP",
    action: "tool.shell",
    allowedModuleScopes: ["runtime.read", "tool.invoke"],
    requestedScopes: ["tool.invoke"],
    rules: [
      {
        id: "tap-shell-approval",
        decision: "requires-approval",
        reason: "TAP must approve shell tools",
        match: { actions: ["tool.shell"], callerKinds: ["official-module"] },
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.moduleId, "tap");
  assert.equal(result.plan.moduleKind, "TAP");
  assert.equal(result.plan.authority.caller.kind, "official-module");
  assert.equal(result.plan.permissionState, "requires-approval");
  assert.equal(result.plan.decision.reason, "TAP must approve shell tools");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.moduleStrategyImplemented, false);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("createModuleGovernanceBridge rejects missing module data and preserves governance denial", () => {
  const missingModule = createModuleGovernanceBridge({
    runtimeId: "runtime-1",
    moduleId: "",
    moduleKind: "CMP",
    action: "context.read",
  });

  assert.equal(missingModule.ok, false);
  assert.equal(missingModule.error.code, "MISSING_MODULE_ID");
  assert.equal(missingModule.error.boundary, "input");

  const denied = createModuleGovernanceBridge({
    runtimeId: "runtime-1",
    moduleId: "mp",
    moduleKind: "MP",
    action: "memory.write",
    allowedModuleScopes: ["runtime.read"],
    requestedScopes: ["memory.write"],
  });

  assert.equal(denied.ok, true);
  assert.equal(denied.plan.permissionState, "deny");
  assert.match(denied.plan.decision.reason, /missing required scope/);
});
