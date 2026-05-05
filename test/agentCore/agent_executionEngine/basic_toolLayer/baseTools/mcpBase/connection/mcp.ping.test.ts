import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planMcpPing } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/connection/mcp.ping.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/connection/mcp.ping.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/connection/mcp.ping.md",
  testFileUrl: import.meta.url,
});

test("planMcpPing creates a guarded dry-run ping plan", () => {
  const result = planMcpPing({
    target: {
      serverId: "docs-server",
      connectionId: "conn-1",
      timeoutMs: 1_500,
    },
    context: {
      invocationId: "ping-1",
      allowedServerIds: ["docs-server"],
      grantedPermissions: ["mcp:ping"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.ping");
  assert.equal(result.output.operationPreview.probeState, "planned");
  assert.equal(result.output.operationPreview.healthy, "unknown");
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.audit[0]?.invocationId, "ping-1");
});

test("planMcpPing rejects missing server and invalid timeout", () => {
  const missing = planMcpPing();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_SERVER_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const invalidTimeout = planMcpPing({
    target: { serverId: "docs-server", timeoutMs: 0 },
  });

  assert.equal(invalidTimeout.ok, false);
  if (!invalidTimeout.ok) {
    assert.equal(invalidTimeout.error.code, "INVALID_TIMEOUT");
  }
});

test("planMcpPing blocks out-of-scope, missing permissions, and real execution", () => {
  const scoped = planMcpPing({
    target: { serverId: "other-server" },
    context: { allowedServerIds: ["docs-server"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }

  const permission = planMcpPing({
    target: { serverId: "docs-server" },
    context: { grantedPermissions: ["mcp:disconnect" as "mcp:ping"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planMcpPing({
    target: { serverId: "docs-server" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
