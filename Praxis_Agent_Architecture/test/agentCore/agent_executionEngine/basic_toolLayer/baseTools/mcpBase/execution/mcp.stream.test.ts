import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  mcpStreamDescriptor,
  planMcpStream,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.stream.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.stream.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.stream.md",
  testFileUrl: import.meta.url,
});

test("planMcpStream returns a governed dry-run stream envelope", () => {
  const result = planMcpStream({
    target: {
      serverId: " fs-mcp ",
      name: " tail_log ",
      channel: "chunks",
      arguments: { path: "agent.log" },
      maxEvents: 5,
    },
    context: {
      invocationId: " invoke-1 ",
      allowedServerIds: ["fs-mcp"],
      grantedPermissions: ["mcp:stream", "mcp:call"],
    },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(result.toolId, "mcp.stream");
  assert.equal(result.output.target.serverId, "fs-mcp");
  assert.equal(result.output.streamEnvelope.name, "tail_log");
  assert.equal(result.output.streamEnvelope.channel, "chunks");
  assert.deepEqual(result.output.streamEnvelope.arguments, { path: "agent.log" });
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(mcpStreamDescriptor.unsafeSideEffects, true);
});

test("planMcpStream rejects empty input with a public-safe error", () => {
  const result = planMcpStream();

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("empty MCP stream input should fail");
  }

  assert.equal(result.error.code, "MISSING_SERVER_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.publicSafe, true);
});

test("planMcpStream rejects invalid channels, missing permissions, and real execution", () => {
  const invalidChannel = planMcpStream({
    target: { serverId: "fs-mcp", name: "tail_log", channel: "frames" as "events" },
  });

  assert.equal(invalidChannel.ok, false);
  if (invalidChannel.ok) {
    assert.fail("unknown stream channel should fail");
  }
  assert.equal(invalidChannel.error.code, "INVALID_CHANNEL");

  const missingPermission = planMcpStream({
    target: { serverId: "fs-mcp", name: "tail_log" },
    context: { grantedPermissions: ["mcp:stream"] },
  });

  assert.equal(missingPermission.ok, false);
  if (missingPermission.ok) {
    assert.fail("stream execution should require call permission too");
  }
  assert.equal(missingPermission.error.code, "PERMISSION_DENIED");

  const realExecution = planMcpStream({
    target: { serverId: "fs-mcp", name: "tail_log" },
    context: { dryRun: false },
  });

  assert.equal(realExecution.ok, false);
  if (realExecution.ok) {
    assert.fail("real MCP stream execution should be blocked");
  }
  assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
});
