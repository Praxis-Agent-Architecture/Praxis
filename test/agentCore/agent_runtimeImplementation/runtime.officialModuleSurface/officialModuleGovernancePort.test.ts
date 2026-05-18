import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { requestOfficialModuleGovernance } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleGovernancePort.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleGovernancePort.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleGovernancePort.md",
  testFileUrl: import.meta.url,
});

test("requestOfficialModuleGovernance connects official module actions to runtime governance", () => {
  const result = requestOfficialModuleGovernance({
    runtimeId: "runtime-1",
    moduleId: "tap.main",
    moduleKind: "tap",
    action: "tool.invoke",
    grantedScopes: ["runtime.read", "tool.invoke"],
    requestedScopes: ["tool.invoke"],
    rules: [
      {
        id: "approval-shell",
        decision: "requires-approval",
        priority: 5,
        reason: "TAP must approve shell-grade tools",
        match: { actions: ["tool.invoke"], requiredScopes: ["tool.invoke"] },
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.grant.module.moduleKind, "tap");
  assert.equal(result.grant.permissionState, "requires-approval");
  assert.equal(result.grant.approvalRequired, true);
  assert.equal(result.grant.dispatch, "dry-run");
  assert.equal(result.grant.unsafeSideEffects, false);
});

test("requestOfficialModuleGovernance returns denied decisions and classifies bad requests", () => {
  const denied = requestOfficialModuleGovernance({
    runtimeId: "runtime-1",
    moduleId: "cmp.main",
    moduleKind: "cmp",
    action: "promptPack.inject",
    grantedScopes: ["runtime.read"],
    requestedScopes: ["promptPack.write"],
  });

  assert.equal(denied.ok, true);
  if (!denied.ok) {
    return;
  }

  assert.equal(denied.grant.permissionState, "deny");
  assert.match(denied.grant.decision.reason, /missing required scope/);

  const invalid = requestOfficialModuleGovernance({
    runtimeId: "runtime-1",
    moduleId: "cmp.main",
    moduleKind: "cmp",
    action: "",
  });

  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, "MISSING_ACTION");
  assert.equal(invalid.error.boundary, "input");
  assert.equal(invalid.error.publicSafe, true);
});
