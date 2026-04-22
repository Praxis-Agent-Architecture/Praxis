import assert from "node:assert/strict";
import test from "node:test";

import {
  exposeMcpInvocationEvent,
  mcpInvocationDescriptor,
} from "../../../../../../src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/mcpInvocation.js";
import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/mcpInvocation.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/mcpInvocation.md",
  testFileUrl: import.meta.url,
});

test("mcpInvocation exposes a dry-run MCP invocation event", () => {
  const result = exposeMcpInvocationEvent({
    runtimeId: " runtime-a ",
    sessionId: " session-a ",
    invocationId: " invoke-a ",
    source: "basicToolLayer",
    serverId: " fs-mcp ",
    toolName: " read_file ",
    requestedScopes: ["tool:mcp", "tool:mcp", " "],
    allowedScopes: ["tool:mcp"],
    contract: { accepted: true },
    governance: { accepted: true },
    trace: { correlationId: " corr-a " },
    metadata: { phase: "planned" },
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.event.kind, "basicToolInvocation.mcp");
  assert.equal(result.event.mcp.serverId, "fs-mcp");
  assert.equal(result.event.mcp.toolName, "read_file");
  assert.deepEqual(result.event.requestedScopes, ["tool:mcp"]);
  assert.deepEqual(result.event.grantedScopes, ["tool:mcp"]);
  assert.equal(result.event.dispatch, "dry-run");
  assert.equal(result.event.unsafeSideEffects, false);
  assert.equal(mcpInvocationDescriptor.unsafeSideEffects, false);
});

test("mcpInvocation rejects empty input with an inspection-safe error", () => {
  const result = exposeMcpInvocationEvent();

  if (result.ok) {
    throw new Error("empty MCP invocation input should fail");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("mcpInvocation rejects scopes outside runtime governance", () => {
  const result = exposeMcpInvocationEvent({
    runtimeId: "runtime-a",
    sessionId: "session-a",
    invocationId: "invoke-a",
    source: "basicToolLayer",
    serverId: "fs-mcp",
    toolName: "read_file",
    requestedScopes: ["tool:mcp", "filesystem:write"],
    allowedScopes: ["tool:mcp"],
  });

  if (result.ok) {
    throw new Error("MCP invocation should not expose scope-denied events");
  }

  assert.equal(result.error.code, "SCOPE_DENIED");
  assert.equal(result.error.boundary, "scope");
  assert.deepEqual(result.events, ["basicToolInvocation.mcp.rejected"]);
});
