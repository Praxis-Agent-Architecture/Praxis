import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeAccessSession } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeAccessSession.js";
import {
  evaluateManagementPolicyGate,
  managementPolicyGateDescriptor,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.managementPlane/managementPolicyGate.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.managementPlane/managementPolicyGate.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.managementPlane/managementPolicyGate.md",
  testFileUrl: import.meta.url,
});

test("evaluateManagementPolicyGate allows and classifies approval-only management commands", () => {
  const session = createRuntimeAccessSession({
    runtimeId: "runtime-1",
    actor: { kind: "operator", id: "operator.main" },
    grantedScopes: ["runtime.read", "runtime.manage", "runtime.inspect"],
  });

  assert.equal(session.ok, true);
  if (!session.ok) {
    return;
  }

  const allow = evaluateManagementPolicyGate({
    session: session.session,
    command: {
      runtimeId: "runtime-1",
      commandId: "cmd-1",
      commandName: "inspect-runtime",
      targetSurface: "runtime.inspection",
      requestedEffects: ["inspect-runtime"],
    },
  });

  assert.equal(managementPolicyGateDescriptor.mode, "dry-run");
  assert.equal(allow.ok, true);
  assert.equal(allow.decision.status, "allow");
  assert.equal(allow.decision.dryRun, true);
  assert.equal(allow.decision.unsafeSideEffects, false);

  const approval = evaluateManagementPolicyGate({
    session: session.session,
    command: {
      commandId: "cmd-2",
      commandName: "rollback-runtime",
      targetSurface: "runtime.managementPlane",
      requestedEffects: ["manage-runtime"],
    },
    rules: [
      {
        id: "approval-rollback",
        status: "requires-approval",
        priority: 10,
        reason: "rollback needs operator confirmation",
        approvalToken: "approval-token",
        match: { commandNames: ["rollback-runtime"] },
      },
    ],
  });

  assert.equal(approval.ok, true);
  assert.equal(approval.decision.status, "requires-approval");
  assert.equal(approval.decision.approvalRequired, true);
  assert.deepEqual(approval.decision.matchedRuleIds, ["approval-rollback"]);
});

test("evaluateManagementPolicyGate denies scope overreach and rejects effects outside the guard", () => {
  const session = createRuntimeAccessSession({
    runtimeId: "runtime-1",
    actor: { kind: "application", id: "app.main" },
    grantedScopes: ["runtime.read"],
  });

  assert.equal(session.ok, true);
  if (!session.ok) {
    return;
  }

  const denied = evaluateManagementPolicyGate({
    session: session.session,
    command: {
      commandId: "cmd-3",
      commandName: "manage-runtime",
      requestedEffects: ["manage-runtime"],
    },
  });

  assert.equal(denied.ok, true);
  assert.equal(denied.decision.status, "deny");
  assert.match(denied.decision.reason, /missing scope/);

  const rejected = evaluateManagementPolicyGate({
    session: session.session,
    command: {
      commandId: "cmd-4",
      commandName: "switch-mode",
      requestedEffects: ["switch-mode"],
    },
    allowedEffects: ["read-runtime"],
  });

  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "EFFECT_NOT_ALLOWED");
  assert.equal(rejected.error.boundary, "scope");
});
