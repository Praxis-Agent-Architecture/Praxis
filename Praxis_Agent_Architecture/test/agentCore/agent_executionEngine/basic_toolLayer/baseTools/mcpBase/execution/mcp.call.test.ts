import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  mcpCallDescriptor,
  planMcpCall,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.call.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.call.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.call.md",
  testFileUrl: import.meta.url,
});

test("planMcpCall returns a governed dry-run MCP call envelope", () => {
  const result = planMcpCall({
    target: {
      serverId: " fs-mcp ",
      name: " read_file ",
      mode: "tool",
      arguments: { path: "README.md" },
      timeoutMs: 1000,
    },
    context: {
      invocationId: " invoke-1 ",
      allowedServerIds: ["fs-mcp"],
      grantedPermissions: ["mcp:call"],
      auditMetadata: { reviewer: "tap" },
    },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(result.toolId, "mcp.call");
  assert.equal(result.output.target.serverId, "fs-mcp");
  assert.equal(result.output.target.name, "read_file");
  assert.deepEqual(result.output.requestEnvelope.arguments, { path: "README.md" });
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(mcpCallDescriptor.tapOwnsApproval, true);
  assert.deepEqual(result.events, ["basicTool.mcp.call.dryRun"]);
});

test("planMcpCall rejects missing target context with a public-safe error", () => {
  const result = planMcpCall();

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("empty MCP call input should fail");
  }

  assert.equal(result.error.code, "MISSING_SERVER_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.publicSafe, true);
});

test("planMcpCall rejects real execution and out-of-scope servers", () => {
  const realExecution = planMcpCall({
    target: { serverId: "fs-mcp", name: "read_file" },
    context: { dryRun: false },
  });

  assert.equal(realExecution.ok, false);
  if (realExecution.ok) {
    assert.fail("real MCP call execution should be blocked");
  }
  assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");

  const scoped = planMcpCall({
    target: { serverId: "shell-mcp", name: "run" },
    context: { allowedServerIds: ["fs-mcp"] },
  });

  assert.equal(scoped.ok, false);
  if (scoped.ok) {
    assert.fail("out-of-scope MCP server should fail");
  }
  assert.equal(scoped.error.code, "SCOPE_REJECTED");
  assert.deepEqual(scoped.events, ["basicTool.mcp.call.rejected"]);
});
