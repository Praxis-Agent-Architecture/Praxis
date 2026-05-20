import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRuntimeGovernancePlane } from "../../../../src/runtimeImplementation/runtime.governancePlane/runtimeGovernancePlane.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.governancePlane/runtimeGovernancePlane.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.governancePlane/runtimeGovernancePlane.md",
  testFileUrl: import.meta.url,
});

test("evaluateRuntimeGovernancePlane returns a stable approval decision without side effects", () => {
  const result = evaluateRuntimeGovernancePlane({
    runtimeId: " runtime-alpha ",
    action: " shellBase.run ",
    actionKind: "tool",
    caller: { kind: "official-module", id: "tap", moduleId: "tap" },
    requestedScopes: ["tool.invoke"],
    grantedScopes: ["runtime.read", "tool.invoke"],
    moduleMounted: true,
    policies: [
      {
        id: " high-risk-tools ",
        decision: "requires-approval",
        actions: ["shellBase.run"],
        callerKinds: ["official-module"],
        requiredScopes: ["tool.invoke"],
        approvalChannel: "tap.humanApproval",
        reason: "tool execution requires TAP approval",
      },
    ],
    auditLabels: [" tool-call ", "tool-call"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.decision.runtimeId, "runtime-alpha");
  assert.equal(result.decision.action, "shellBase.run");
  assert.equal(result.decision.status, "requires-approval");
  assert.equal(result.decision.approvalRequired, true);
  assert.equal(result.decision.approvalChannel, "tap.humanApproval");
  assert.deepEqual(result.decision.matchedPolicyIds, ["high-risk-tools"]);
  assert.deepEqual(result.decision.auditTrail, [
    "runtime.governance.plane.evaluated",
    "runtime:runtime-alpha",
    "action:shellBase.run",
    "tool-call",
  ]);
  assert.equal(result.decision.unsafeSideEffects, false);
});

test("evaluateRuntimeGovernancePlane classifies missing scopes and runtime errors", () => {
  const denied = evaluateRuntimeGovernancePlane({
    runtimeId: "runtime-alpha",
    action: "model.invoke",
    actionKind: "model",
    caller: { kind: "application", id: "app" },
    requestedScopes: ["model.invoke"],
    grantedScopes: ["runtime.read"],
  });

  assert.equal(denied.ok, true);
  if (!denied.ok) {
    return;
  }

  assert.equal(denied.decision.status, "deny");
  assert.deepEqual(denied.decision.missingScopes, ["model.invoke"]);
  assert.equal(denied.decision.approvalRequired, false);

  const rejected = evaluateRuntimeGovernancePlane({
    runtimeId: "runtime-alpha",
    action: "module.bridge",
    caller: { kind: "official-module", id: "cmp" },
    moduleMounted: false,
  });

  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    return;
  }

  assert.equal(rejected.error.code, "MODULE_NOT_MOUNTED");
  assert.equal(rejected.error.boundary, "governance");
  assert.equal(rejected.error.publicSafe, true);
});
