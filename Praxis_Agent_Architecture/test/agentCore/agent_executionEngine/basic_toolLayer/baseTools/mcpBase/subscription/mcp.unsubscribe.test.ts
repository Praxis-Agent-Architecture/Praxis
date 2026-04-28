import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  mcpUnsubscribeDescriptor,
  planMcpUnsubscribe,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/subscription/mcp.unsubscribe.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/subscription/mcp.unsubscribe.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/subscription/mcp.unsubscribe.md",
  testFileUrl: import.meta.url,
});

test("planMcpUnsubscribe creates a guarded dry-run unsubscribe envelope", () => {
  const result = planMcpUnsubscribe({
    target: {
      serverId: "events",
      subscriptionId: "sub-123",
      reason: "caller stopped watching",
    },
    context: {
      invocationId: "unsubscribe-1",
      requestedScopes: ["mcp:events"],
      allowedScopes: ["mcp:events"],
      grantedPermissions: ["mcp:subscription:write"],
    },
  });

  assert.equal(mcpUnsubscribeDescriptor.defaultDryRun, true);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.unsubscribe");
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.output.unsubscribeEnvelope.subscriptionId, "sub-123");
  assert.equal(result.output.unsubscribeEnvelope.state, "cancel-planned");
  assert.equal(result.output.unsubscribeEnvelope.reason, "caller stopped watching");
  assert.equal(result.audit[0]?.invocationId, "unsubscribe-1");
});

test("planMcpUnsubscribe rejects missing target fields", () => {
  const missingServer = planMcpUnsubscribe({
    target: { subscriptionId: "sub-123" },
  });

  assert.equal(missingServer.ok, false);
  if (!missingServer.ok) {
    assert.equal(missingServer.error.code, "MISSING_SERVER_ID");
  }

  const missingSubscription = planMcpUnsubscribe({
    target: { serverId: "events" },
  });

  assert.equal(missingSubscription.ok, false);
  if (!missingSubscription.ok) {
    assert.equal(missingSubscription.error.code, "MISSING_SUBSCRIPTION_ID");
    assert.equal(missingSubscription.error.boundary, "input");
  }
});

test("planMcpUnsubscribe rejects malformed JSON without raw TypeError", () => {
  for (const input of [null, [], 1, { target: null }, { target: { serverId: 1 } }, { target: { serverId: "events", subscriptionId: 1 } }, { target: { serverId: "events", subscriptionId: "sub-123", reason: "x".repeat(257) } }]) {
    const result = planMcpUnsubscribe(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.publicSafe, true);
    }
  }
});

test("planMcpUnsubscribe blocks denied scope, missing permission, contract rejection, and real execution", () => {
  const scoped = planMcpUnsubscribe({
    target: { serverId: "events", subscriptionId: "sub-123" },
    context: { requestedScopes: ["mcp:private"], allowedScopes: ["mcp:events"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_DENIED");
  }

  const permission = planMcpUnsubscribe({
    target: { serverId: "events", subscriptionId: "sub-123" },
    context: { grantedPermissions: ["mcp:resource:read" as "mcp:subscription:write"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const contract = planMcpUnsubscribe({
    target: { serverId: "events", subscriptionId: "sub-123" },
    context: { contract: { accepted: false, reason: "bad contract" } },
  });

  assert.equal(contract.ok, false);
  if (!contract.ok) {
    assert.equal(contract.error.code, "CONTRACT_REJECTED");
  }

  const real = planMcpUnsubscribe({
    target: { serverId: "events", subscriptionId: "sub-123" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
