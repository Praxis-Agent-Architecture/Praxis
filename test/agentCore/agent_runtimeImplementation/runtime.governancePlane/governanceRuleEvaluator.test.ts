import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { evaluateGovernanceRule } from "../../../../src/agentCore_runtimeImplementation/runtime.governancePlane/governanceRuleEvaluator.js";
import { resolveRuntimeAuthority } from "../../../../src/agentCore_runtimeImplementation/runtime.governancePlane/runtimeAuthorityResolver.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.governancePlane/governanceRuleEvaluator.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.governancePlane/governanceRuleEvaluator.md",
  testFileUrl: import.meta.url,
});

test("evaluateGovernanceRule returns allow, approval, and degrade decisions without executing actions", () => {
  const authority = resolveRuntimeAuthority({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app.main" },
    grantedScopes: ["runtime.invoke", "tool.invoke"],
  });

  assert.equal(authority.ok, true);
  if (!authority.ok) {
    return;
  }

  const allow = evaluateGovernanceRule({
    runtimeId: "runtime-1",
    action: "agent.invoke",
    authority: authority.authority,
    requestedScopes: ["runtime.invoke"],
  });

  assert.equal(allow.ok, true);
  assert.equal(allow.decision.status, "allow");
  assert.equal(allow.decision.unsafeSideEffects, false);

  const approval = evaluateGovernanceRule({
    runtimeId: "runtime-1",
    action: "tool.shell",
    authority: authority.authority,
    requestedScopes: ["tool.invoke"],
    rules: [
      {
        id: "approval-shell",
        decision: "requires-approval",
        priority: 10,
        reason: "shell tool needs TAP approval",
        match: { actions: ["tool.shell"], requiredScopes: ["tool.invoke"] },
      },
    ],
  });

  assert.equal(approval.ok, true);
  assert.equal(approval.decision.status, "requires-approval");
  assert.equal(approval.decision.approvalRequired, true);
  assert.deepEqual(approval.decision.matchedRuleIds, ["approval-shell"]);

  const degrade = evaluateGovernanceRule({
    runtimeId: "runtime-1",
    action: "model.invoke",
    authority: authority.authority,
    rules: [
      {
        id: "degrade-model",
        decision: "degrade",
        reason: "use safe model tier",
        degradationTarget: "model.safe-tier",
        match: { actions: ["model.invoke"] },
      },
    ],
  });

  assert.equal(degrade.ok, true);
  assert.equal(degrade.decision.status, "degrade");
  assert.equal(degrade.decision.degradationTarget, "model.safe-tier");
});

test("evaluateGovernanceRule denies scope overreach and classifies invalid input", () => {
  const authority = resolveRuntimeAuthority({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "tap" },
    grantedScopes: ["runtime.read"],
  });

  assert.equal(authority.ok, true);
  if (!authority.ok) {
    return;
  }

  const denied = evaluateGovernanceRule({
    runtimeId: "runtime-1",
    action: "tool.invoke",
    authority: authority.authority,
    requestedScopes: ["tool.invoke"],
  });

  assert.equal(denied.ok, true);
  assert.equal(denied.decision.status, "deny");
  assert.match(denied.decision.reason, /missing required scope/);

  const missingAction = evaluateGovernanceRule({
    runtimeId: "runtime-1",
    action: "",
    authority: authority.authority,
  });

  assert.equal(missingAction.ok, false);
  assert.equal(missingAction.error.code, "MISSING_ACTION");
  assert.equal(missingAction.error.boundary, "input");
});
