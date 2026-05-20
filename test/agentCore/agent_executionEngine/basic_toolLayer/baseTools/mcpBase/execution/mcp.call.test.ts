import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeMcpCall,
  mcpCallDescriptor,
  mcpCallHandler,
  planMcpCall,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.call.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.call.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/execution/mcp.call.md",
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
  assert.equal(result.output.providerCalled, false);
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

test("executeMcpCall keeps dry-run calls away from provider", async () => {
  let providerCalled = false;
  const result = await executeMcpCall({
    target: { serverId: "fs-mcp", name: "read_file", arguments: { path: "README.md" } },
    context: { dryRun: true },
    provider: async () => {
      providerCalled = true;
      return { ok: true };
    },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(providerCalled, false);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.providerCalled, false);
});

test("executeMcpCall invokes fake provider when guard accepts real execution", async () => {
  let seen: unknown;
  const result = await executeMcpCall({
    target: { serverId: "fs-mcp", toolName: "read_file", arguments: { path: "README.md" }, timeoutMs: 500 },
    context: { dryRun: false, guard: { accepted: true }, runtimeId: "runtime-1" },
    provider: async (request: {
      serverId: string;
      toolName: string;
      mode: "tool" | "service";
      arguments?: Readonly<Record<string, unknown>>;
      timeoutMs?: number;
    }) => {
      seen = request;
      return { content: [{ type: "text", text: "ok" }] };
    },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.deepEqual(seen, {
    serverId: "fs-mcp",
    toolName: "read_file",
    mode: "tool",
    arguments: { path: "README.md" },
    timeoutMs: 500,
  });
  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.providerCalled, true);
  assert.deepEqual(result.output.providerResult, { content: [{ type: "text", text: "ok" }] });
});

test("executeMcpCall reports unavailable, rejected governance, and provider failure as public-safe errors", async () => {
  const unavailable = await executeMcpCall({
    target: { serverId: "fs-mcp", name: "read_file" },
    context: { dryRun: false, guard: { accepted: true } },
  });
  assert.equal(unavailable.ok, false);
  if (unavailable.ok) assert.fail("missing provider should fail");
  assert.equal(unavailable.error.code, "PROVIDER_UNAVAILABLE");
  assert.equal(unavailable.error.publicSafe, true);

  const rejected = await executeMcpCall({
    target: { serverId: "fs-mcp", name: "read_file" },
    context: { dryRun: false },
    provider: async () => ({ ok: true }),
  });
  assert.equal(rejected.ok, false);
  if (rejected.ok) assert.fail("missing guard should fail");
  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");

  const providerFailure = await executeMcpCall({
    target: { serverId: "fs-mcp", name: "read_file" },
    context: { dryRun: false, guard: { allowed: true } },
    provider: async () => {
      throw new TypeError("secret transport stack");
    },
  });
  assert.equal(providerFailure.ok, false);
  if (providerFailure.ok) assert.fail("provider throw should fail");
  assert.equal(providerFailure.error.code, "PROVIDER_REJECTED");
  assert.equal(providerFailure.error.publicSafe, true);
  assert.equal(providerFailure.error.internalDetailExposed, false);
});

test("executeMcpCall treats malformed JSON boundaries as public-safe validation failures", async () => {
  const cases: readonly unknown[] = [
    null,
    [],
    1,
    { target: null },
    { target: { serverId: 1, name: "read_file" } },
    { target: { serverId: "fs-mcp", name: "read_file", arguments: [] } },
    { target: { serverId: "fs-mcp", name: "read_file", timeoutMs: Number.NaN } },
  ];

  for (const input of cases) {
    const result = await executeMcpCall(input);
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("malformed MCP call input should fail");
    assert.equal(result.error.publicSafe, true);
  }
});

test("mcpCallHandler invokes runtime-owned MCP provider through BaseToolExecutorPort", async () => {
  let seen: unknown;
  const result = await mcpCallHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { serverId: "fs-mcp", name: "read_file", arguments: { path: "README.md" } },
      context: { dryRun: false, guard: { accepted: true } },
    },
    executor: {
      mcp: {
        async callTool(request) {
          seen = request;
          return { ok: true, output: { content: [{ type: "text", text: "from-runtime" }] } };
        },
      },
    },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  const seenRequest = seen as {
    serverId: string;
    toolName: string;
    arguments?: Readonly<Record<string, unknown>>;
    mode?: string;
    context?: Readonly<Record<string, unknown>>;
  };
  assert.equal(seenRequest.serverId, "fs-mcp");
  assert.equal(seenRequest.toolName, "read_file");
  assert.deepEqual(seenRequest.arguments, { path: "README.md" });
  assert.equal(seenRequest.mode, "tool");
  assert.equal(seenRequest.context?.runtimeId, "runtime-1");
  assert.equal(seenRequest.context?.sessionId, "session-1");
  assert.equal(seenRequest.context?.invocationId, "tool-call-1");
  assert.equal(result.output.providerCalled, true);
  assert.deepEqual(result.output.providerResult, { content: [{ type: "text", text: "from-runtime" }] });
});

test("baseTool registry resolves mcp.call handler and invokes fake executor", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("mcp.call");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) assert.fail("mcp.call handler should resolve");

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { serverId: "fs-mcp", name: "read_file" },
      context: { dryRun: false, guard: { accepted: true } },
    },
    executor: {
      mcp: {
        async callTool() {
          return { ok: true, output: { ok: true } };
        },
      },
    },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(result.toolId, "mcp.call");
  assert.deepEqual((result.output as { providerResult?: unknown }).providerResult, { ok: true });
});
