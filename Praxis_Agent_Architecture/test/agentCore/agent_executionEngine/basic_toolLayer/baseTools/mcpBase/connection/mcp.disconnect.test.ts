import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planMcpDisconnect } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/connection/mcp.disconnect.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/connection/mcp.disconnect.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/connection/mcp.disconnect.md",
  testFileUrl: import.meta.url,
});

test("planMcpDisconnect creates a guarded dry-run disconnect plan", () => {
  const result = planMcpDisconnect({
    target: {
      serverId: "docs-server",
      connectionId: "conn-1",
      reason: "rotate credentials",
      force: true,
    },
    context: {
      invocationId: "disconnect-1",
      allowedServerIds: ["docs-server"],
      grantedPermissions: ["mcp:disconnect"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.disconnect");
  assert.equal(result.output.operationPreview.connectionState, "disconnect-planned");
  assert.equal(result.output.operationPreview.force, true);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "disconnect-1");
});

test("planMcpDisconnect rejects missing server and invalid reason", () => {
  const missing = planMcpDisconnect();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_SERVER_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const invalidReason = planMcpDisconnect({
    target: { serverId: "docs-server", reason: "x".repeat(257) },
  });

  assert.equal(invalidReason.ok, false);
  if (!invalidReason.ok) {
    assert.equal(invalidReason.error.code, "INVALID_REASON");
  }
});

test("planMcpDisconnect blocks out-of-scope, missing permissions, and real execution", () => {
  const scoped = planMcpDisconnect({
    target: { serverId: "other-server" },
    context: { allowedServerIds: ["docs-server"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }

  const permission = planMcpDisconnect({
    target: { serverId: "docs-server" },
    context: { grantedPermissions: ["mcp:ping" as "mcp:disconnect"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planMcpDisconnect({
    target: { serverId: "docs-server" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
