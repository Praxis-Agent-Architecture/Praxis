import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  mcpNativeExecuteDescriptor,
  planMcpNativeExecute,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.nativeExecute.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.nativeExecute.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.nativeExecute.md",
  testFileUrl: import.meta.url,
});

test("planMcpNativeExecute returns a governed dry-run native MCP envelope", () => {
  const result = planMcpNativeExecute({
    target: {
      serverId: " fs-mcp ",
      method: " tools/call ",
      params: { name: "read_file" },
      protocolVersion: "2025-06-18",
      idempotencyKey: " native-1 ",
    },
    context: {
      invocationId: " invoke-1 ",
      allowedServerIds: ["fs-mcp"],
      grantedPermissions: ["mcp:native-execute", "mcp:raw"],
    },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(result.toolId, "mcp.nativeExecute");
  assert.equal(result.output.target.serverId, "fs-mcp");
  assert.equal(result.output.nativeEnvelope.method, "tools/call");
  assert.deepEqual(result.output.nativeEnvelope.params, { name: "read_file" });
  assert.equal(result.output.nativeEnvelope.protocolVersion, "2025-06-18");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(mcpNativeExecuteDescriptor.tapOwnsApproval, true);
});

test("planMcpNativeExecute rejects empty input with a public-safe error", () => {
  const result = planMcpNativeExecute();

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("empty MCP native execute input should fail");
  }

  assert.equal(result.error.code, "MISSING_SERVER_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.publicSafe, true);
});

test("planMcpNativeExecute rejects invalid params, missing permissions, and real execution", () => {
  const invalidParams = planMcpNativeExecute({
    target: {
      serverId: "fs-mcp",
      method: "tools/call",
      params: ["not", "a", "record"] as unknown as Record<string, unknown>,
    },
  });

  assert.equal(invalidParams.ok, false);
  if (invalidParams.ok) {
    assert.fail("native params should be a record");
  }
  assert.equal(invalidParams.error.code, "INVALID_PARAMS");

  const missingPermission = planMcpNativeExecute({
    target: { serverId: "fs-mcp", method: "tools/call" },
    context: { grantedPermissions: ["mcp:native-execute"] },
  });

  assert.equal(missingPermission.ok, false);
  if (missingPermission.ok) {
    assert.fail("native execution should require raw MCP permission");
  }
  assert.equal(missingPermission.error.code, "PERMISSION_DENIED");

  const realExecution = planMcpNativeExecute({
    target: { serverId: "fs-mcp", method: "tools/call" },
    context: { dryRun: false },
  });

  assert.equal(realExecution.ok, false);
  if (realExecution.ok) {
    assert.fail("real native MCP execution should be blocked");
  }
  assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
});
