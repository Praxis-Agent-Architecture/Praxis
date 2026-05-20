import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createTapApprovalGovernanceBridge,
} from "../../../../src/runtimeImplementation/runtime.governancePlane/tapApprovalGovernanceBridge.js";
import {
  evaluateRuntimeGovernancePlane,
} from "../../../../src/runtimeImplementation/runtime.governancePlane/runtimeGovernancePlane.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.governancePlane/tapApprovalGovernanceBridge.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.governancePlane/tapApprovalGovernanceBridge.md",
  testFileUrl: import.meta.url,
});

test("createTapApprovalGovernanceBridge plans a dry-run TAP approval envelope", () => {
  const governance = evaluateRuntimeGovernancePlane({
    runtimeId: "runtime-alpha",
    action: "shellBase.run",
    actionKind: "tool",
    caller: { kind: "official-module", id: "tap", moduleId: "tap" },
    requestedScopes: ["tool.invoke"],
    grantedScopes: ["tool.invoke"],
    moduleMounted: true,
    policies: [
      {
        id: "tool-approval",
        decision: "requires-approval",
        actions: ["shellBase.run"],
        approvalChannel: "tap.humanApproval",
      },
    ],
  });

  assert.equal(governance.ok, true);
  if (!governance.ok) {
    return;
  }

  const result = createTapApprovalGovernanceBridge({
    runtimeId: "runtime-alpha",
    targetKind: "tool-call",
    governanceDecision: governance.decision,
    riskLevel: "critical",
    tapMounted: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.approvalRequired, true);
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.tapCallPlanned, true);
  assert.equal(result.plan.tapStrategyImplemented, false);
  assert.equal(result.plan.approval?.requestId, "tap:runtime-alpha:shellBase.run:tap");
  assert.equal(result.plan.approval?.approvalChannel, "tap.humanApproval");
  assert.equal(result.plan.approval?.delegatedToTap, true);
  assert.equal(result.plan.approval?.humanConfirmationRequired, true);
  assert.equal(result.plan.approval?.unsafeSideEffects, false);
});

test("createTapApprovalGovernanceBridge preserves governance and TAP mount failures", () => {
  const denied = createTapApprovalGovernanceBridge({
    runtimeId: "runtime-alpha",
    action: "shellBase.run",
    caller: { kind: "application", id: "app" },
    governanceDecision: {
      status: "deny",
      runtimeId: "runtime-alpha",
      action: "shellBase.run",
      actionKind: "tool",
      caller: { kind: "application", id: "app" },
      requestedScopes: ["tool.invoke"],
      grantedScopes: [],
      missingScopes: ["tool.invoke"],
      matchedPolicyIds: [],
      reason: "scope denied",
      approvalRequired: false,
      auditTrail: [],
      governanceSurface: "runtime.governancePlane",
      unsafeSideEffects: false,
    },
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    return;
  }

  assert.equal(denied.error.code, "GOVERNANCE_DENIED");
  assert.equal(denied.error.boundary, "governance");

  const tapMissing = createTapApprovalGovernanceBridge({
    runtimeId: "runtime-alpha",
    action: "shellBase.run",
    targetKind: "tool-call",
    caller: { kind: "application", id: "app" },
    riskLevel: "high",
    tapMounted: false,
  });

  assert.equal(tapMissing.ok, false);
  if (tapMissing.ok) {
    return;
  }

  assert.equal(tapMissing.error.code, "TAP_NOT_MOUNTED");
  assert.equal(tapMissing.error.boundary, "governance");
});

test("createTapApprovalGovernanceBridge normalizes direct approval envelope identifiers", () => {
  const result = createTapApprovalGovernanceBridge({
    runtimeId: " runtime-alpha ",
    action: " shellBase.run ",
    targetKind: "tool-call",
    caller: { kind: "application", id: " app.main " },
    riskLevel: "high",
    tapMounted: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.runtimeId, "runtime-alpha");
  assert.equal(result.plan.action, "shellBase.run");
  assert.equal(result.plan.approval?.requestId, "tap:runtime-alpha:shellBase.run:app.main");
  assert.equal(result.plan.approval?.requestedBy.id, "app.main");
});
