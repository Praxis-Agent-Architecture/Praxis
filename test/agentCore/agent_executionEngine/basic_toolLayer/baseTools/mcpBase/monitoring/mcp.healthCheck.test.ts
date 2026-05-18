import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planMcpHealthCheck } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/monitoring/mcp.healthCheck.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/monitoring/mcp.healthCheck.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/monitoring/mcp.healthCheck.md",
  testFileUrl: import.meta.url,
});

test("planMcpHealthCheck creates a guarded dry-run health probe envelope", () => {
  const result = planMcpHealthCheck({
    target: {
      serverId: "filesystem-mcp",
      includeCapabilities: true,
      includeLatencyProbe: true,
    },
    context: {
      invocationId: "health-1",
      allowedServerIds: ["filesystem-mcp"],
      grantedPermissions: ["mcp:connection:read", "mcp:monitor:read"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.healthCheck");
  assert.equal(result.output.target.serverId, "filesystem-mcp");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.output.probeEnvelope.status, "unknown");
  assert.equal(result.audit[0]?.invocationId, "health-1");
});

test("planMcpHealthCheck rejects missing target, denied scope, and real execution", () => {
  const missing = planMcpHealthCheck();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_SERVER_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const denied = planMcpHealthCheck({
    target: { serverId: "external-mcp" },
    context: { allowedServerIds: ["filesystem-mcp"] },
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_REJECTED");
  }

  const real = planMcpHealthCheck({
    target: { serverId: "filesystem-mcp" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
