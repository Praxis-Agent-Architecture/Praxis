import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeAccessSession } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeAccessSession.js";
import { evaluateManagementPolicyGate } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.managementPlane/managementPolicyGate.js";
import {
  createRuntimeGovernanceBridgeEnvelope,
  runtimeGovernanceBridgeDescriptor,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeGovernanceBridge.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeGovernanceBridge.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeGovernanceBridge.md",
  testFileUrl: import.meta.url,
});

test("createRuntimeGovernanceBridgeEnvelope converts a policy decision into a dry-run governance envelope", () => {
  const session = createRuntimeAccessSession({
    runtimeId: "runtime-1",
    actor: { kind: "operator", id: "operator.main" },
    grantedScopes: ["runtime.read", "runtime.manage", "module.requestGovernance"],
  });

  assert.equal(session.ok, true);
  if (!session.ok) {
    return;
  }

  const command = {
    runtimeId: "runtime-1",
    commandId: "cmd-1",
    commandName: "bridge-governance",
    targetSurface: "runtime.governancePlane",
    requestedEffects: ["bridge-governance"] as const,
  };
  const policy = evaluateManagementPolicyGate({ session: session.session, command });

  assert.equal(policy.ok, true);
  if (!policy.ok) {
    return;
  }

  const result = createRuntimeGovernanceBridgeEnvelope({
    session: session.session,
    command,
    policy: policy.decision,
  });

  assert.equal(runtimeGovernanceBridgeDescriptor.mode, "dry-run");
  assert.equal(result.ok, true);
  assert.equal(result.envelope.action, "management.bridge-governance");
  assert.equal(result.envelope.bridgeStatus, "ready");
  assert.equal(result.envelope.governanceChecked, true);
  assert.equal(result.envelope.unsafeSideEffects, false);
});

test("createRuntimeGovernanceBridgeEnvelope requires a prior policy decision and preserves blocked status", () => {
  const session = createRuntimeAccessSession({
    runtimeId: "runtime-1",
    actor: { kind: "application", id: "app.main" },
    grantedScopes: ["runtime.read"],
  });

  assert.equal(session.ok, true);
  if (!session.ok) {
    return;
  }

  const command = {
    runtimeId: "runtime-1",
    commandId: "cmd-2",
    commandName: "manage-runtime",
    requestedEffects: ["manage-runtime"] as const,
  };

  const missingPolicy = createRuntimeGovernanceBridgeEnvelope({
    session: session.session,
    command,
  });

  assert.equal(missingPolicy.ok, false);
  assert.equal(missingPolicy.error.code, "MISSING_POLICY_DECISION");

  const policy = evaluateManagementPolicyGate({ session: session.session, command });
  assert.equal(policy.ok, true);
  if (!policy.ok) {
    return;
  }

  const blocked = createRuntimeGovernanceBridgeEnvelope({
    session: session.session,
    command,
    policy: policy.decision,
  });

  assert.equal(blocked.ok, true);
  assert.equal(blocked.envelope.policyStatus, "deny");
  assert.equal(blocked.envelope.bridgeStatus, "blocked");
});
